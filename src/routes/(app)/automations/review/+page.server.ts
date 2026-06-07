import { fail, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { parseMemoryList, MEMORY_STATES, REVIEW_PAGE_SIZE } from '$lib/automations/memory';
import { parsePrecedentList, parseProposalList } from '$lib/automations/precedents';
import type { PrecedentList, ProposalList } from '$lib/automations/precedents';
import { errorDetail, jsonOr } from '$lib/server/loadJson';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const rawState = event.url.searchParams.get('state') ?? '';
	const state = (MEMORY_STATES as readonly string[]).includes(rawState) ? rawState : 'proposed';

	const rawOffset = parseInt(event.url.searchParams.get('offset') ?? '0', 10);
	const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

	const autonomousEnabled = await isAutonomousEnabled(event);

	if (!autonomousEnabled) {
		return {
			autonomousEnabled,
			unread: 0,
			state,
			offset,
			entries: [],
			total: 0,
			precedents: null as PrecedentList | null,
			proposals: null as ProposalList | null,
			matters: [] as { id: string; name: string }[]
		};
	}

	const [unread, res, precedentsRes, proposalsRes, mattersRes] = await Promise.all([
		unreadCount(event),
		lqFetch(
			event,
			`/api/v1/autonomous/memory?state=${state}&limit=${REVIEW_PAGE_SIZE}&offset=${offset}`
		),
		lqFetch(event, '/api/v1/autonomous/precedents?limit=50&offset=0'),
		lqFetch(event, '/api/v1/autonomous/project-context-proposals?state=proposed'),
		lqFetch(event, '/api/v1/projects')
	]);

	if (!res.ok) {
		return {
			autonomousEnabled,
			unread,
			state,
			offset,
			error: true,
			entries: [],
			total: 0,
			precedents: null as PrecedentList | null,
			proposals: null as ProposalList | null,
			matters: [] as { id: string; name: string }[]
		};
	}

	const { entries, total } = parseMemoryList(await res.json());

	// Stale-offset clamp: if offset is past the end of results, redirect to the last valid page.
	if (offset > 0 && offset >= total) {
		const clampedOffset = Math.max(
			0,
			Math.floor(Math.max(total - 1, 0) / REVIEW_PAGE_SIZE) * REVIEW_PAGE_SIZE
		);
		throw redirect(303, `?state=${state}&offset=${clampedOffset}`);
	}

	// Independent degradation for the three new sections.
	const precedents: PrecedentList | null = precedentsRes.ok
		? parsePrecedentList(await precedentsRes.json())
		: null;

	const proposals: ProposalList | null = proposalsRes.ok
		? parseProposalList(await proposalsRes.json())
		: null;

	const rawMatters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);
	const matters = rawMatters.map((m) => ({ id: m.id, name: m.name }));

	return {
		autonomousEnabled,
		unread,
		state,
		offset,
		entries,
		total,
		precedents,
		proposals,
		matters
	};
};

// Shared error mapper for precedent + proposal actions.
async function mapPrecedentActionError(res: Response, id: string, genericMsg: string) {
	if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
	if (res.status === 404) return fail(404, { error: 'This item no longer exists.', id });
	if (res.status === 422 || res.status === 400) {
		const detail = await errorDetail(res);
		return fail(res.status, { error: detail || genericMsg, id });
	}
	return fail(502, { error: genericMsg, id });
}

export const actions: Actions = {
	keep: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const rawContent = String(form.get('content') ?? '').trim();
		const body: Record<string, string> = {};
		if (rawContent.length > 0) body.content = rawContent;

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}/keep`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (res.status === 422 || res.status === 400) {
			const detail = await errorDetail(res);
			return fail(res.status, { error: detail || 'Could not apply the change.', id });
		}
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	},

	dismiss: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}/dismiss`, {
			method: 'POST',
			body: JSON.stringify({})
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (res.status === 422 || res.status === 400) {
			const detail = await errorDetail(res);
			return fail(res.status, { error: detail || 'Could not apply the change.', id });
		}
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	},

	delete: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}`, {
			method: 'DELETE'
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (res.status === 422 || res.status === 400) {
			const detail = await errorDetail(res);
			return fail(res.status, { error: detail || 'Could not apply the change.', id });
		}
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	},

	dismissPrecedent: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing precedent id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/precedents/${id}/dismiss`, {
			method: 'POST',
			body: JSON.stringify({})
		});

		if (res.ok) return { ok: true };
		return mapPrecedentActionError(res, id, 'Could not apply the change.');
	},

	promote: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const project_id = String(form.get('project_id') ?? '');
		if (!id) return fail(400, { error: 'Missing precedent id.' });
		if (!project_id) return fail(400, { error: 'Pick a matter first.', id });

		const res = await lqFetch(event, `/api/v1/autonomous/precedents/${id}/promote`, {
			method: 'POST',
			body: JSON.stringify({ project_id })
		});

		if (res.ok) return { ok: true, promoted: true };
		return mapPrecedentActionError(res, id, 'Could not apply the change.');
	},

	acceptProposal: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing proposal id.' });
		const rawProjectId = String(form.get('project_id') ?? '').trim();
		const projectId = rawProjectId || null;

		const res = await lqFetch(event, `/api/v1/autonomous/project-context-proposals/${id}/accept`, {
			method: 'POST',
			body: JSON.stringify({})
		});

		if (res.ok) return { ok: true, accepted: true, projectId };
		return mapPrecedentActionError(res, id, 'Could not apply the change.');
	},

	rejectProposal: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing proposal id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/project-context-proposals/${id}/reject`, {
			method: 'POST',
			body: JSON.stringify({})
		});

		if (res.ok) return { ok: true };
		return mapPrecedentActionError(res, id, 'Could not apply the change.');
	}
};
