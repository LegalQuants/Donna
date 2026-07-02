import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ChatMessage } from '$lib/chat/chatStream.svelte';
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';
import { anonymizedByMessage } from '$lib/receipts/format';
import type { ReceiptEvent } from '$lib/receipts/types';
import { parseLedger, entriesForMessage, gateForMessage } from '$lib/fiduciary/ledger';
import { resolveMatter } from './matter';
import { parseDraftSkills } from './draftSkills';
import { parseDraftSkillInputs } from './draftSkillInputs';
import { parseDraftFileIds } from './draftFileIds';
import { parseChat } from '$lib/chat/chat';

export const load: PageServerLoad = async (event) => {
	const draft = event.cookies.get('donna_draft') ?? null;
	if (draft) event.cookies.delete('donna_draft', { path: '/' });
	const rawDraftSkills = event.cookies.get('donna_draft_skills');
	if (rawDraftSkills) event.cookies.delete('donna_draft_skills', { path: '/' });
	const draftSkills = parseDraftSkills(rawDraftSkills);
	const rawDraftSkillInputs = event.cookies.get('donna_draft_skill_inputs');
	if (rawDraftSkillInputs) event.cookies.delete('donna_draft_skill_inputs', { path: '/' });
	const draftSkillInputs = parseDraftSkillInputs(rawDraftSkillInputs);
	const rawDraftFileIds = event.cookies.get('donna_draft_file_ids');
	if (rawDraftFileIds) event.cookies.delete('donna_draft_file_ids', { path: '/' });
	const draftFileIds = parseDraftFileIds(rawDraftFileIds);

	const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages?limit=100`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load this chat.');
	const page = (await res.json()) as { items: ChatMessage[] };

	const messages: ChatMessage[] = page.items.map((m) => ({
		key: m.id, // history rows have stable backend ids — safe as the list key
		id: m.id,
		role: m.role,
		content: m.content,
		routed_inference_tier: m.routed_inference_tier,
		applied_skills: m.applied_skills,
		status: 'done'
	}));

	// Citations are served per-message (M2-A2), not inline in the messages list.
	// Fetch them in parallel for assistant turns that actually contain markers.
	await Promise.all(
		messages.map(async (m) => {
			if (m.role !== 'assistant' || !hasCitationMarkers(m.content)) return;
			try {
				const r = await lqFetch(
					event,
					`/api/v1/chats/${event.params.id}/messages/${m.id}/citations`
				);
				if (r.ok) m.citations = (await r.json()) as Citation[];
			} catch {
				/* leave undefined — message degrades to plain markers */
			}
		})
	);

	// One-shot ledger hydration: fetch the whole chat ledger once, group by message_id.
	try {
		const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/ledger`);
		if (res.ok) {
			const ledger = parseLedger(await res.json());
			for (const m of messages) {
				if (m.role !== 'assistant') continue;
				const entries = entriesForMessage(ledger, m.id);
				if (entries.length > 0) m.ledgerEntries = entries;
				const gate = gateForMessage(ledger, m.id);
				if (gate) m.ledgerGate = gate;
			}
		}
	} catch {
		/* ledger is optional — never break the page */
	}

	// Per-message anonymization status from the inference receipts (M2-D2).
	try {
		const r = await lqFetch(
			event,
			`/api/v1/chats/${event.params.id}/receipts?event_kinds=inference`
		);
		if (r.ok) {
			const map = anonymizedByMessage((await r.json()) as ReceiptEvent[]);
			for (const m of messages) {
				if (m.role === 'assistant' && map.has(m.id)) m.anonymized = map.get(m.id);
			}
		}
	} catch {
		/* non-blocking — badges simply absent */
	}

	// Fetch the chat once to derive both its sticky-skills set (composer "Keep skills on" toggle)
	// and its project_id (matter header). Each degrades independently: off / unscoped on failure.
	let stickySkills: string[] = [];
	let projectId: string | null = null;
	try {
		const cr = await lqFetch(event, `/api/v1/chats/${event.params.id}`);
		if (cr.ok) {
			const cj = await cr.json();
			stickySkills = parseChat(cj).stickySkills;
			projectId = (cj as { project_id?: string | null }).project_id ?? null;
		}
	} catch {
		/* leave [] / null — the toggle reads off and the matter is unscoped */
	}

	const matter = await resolveMatter((path) => lqFetch(event, path), projectId);

	return {
		chatId: event.params.id,
		messages,
		draft,
		draftSkills,
		draftSkillInputs,
		draftFileIds,
		matter,
		stickySkills
	};
};
