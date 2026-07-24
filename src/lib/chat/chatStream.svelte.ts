import { createSseParser, type StreamFrame } from './sse';
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';
import { parseToolSources, type ToolSource } from '$lib/citations/sources';
import { anonymizedByMessage } from '$lib/receipts/format';
import type { ReceiptEvent } from '$lib/receipts/types';
import {
	parseLedger,
	gateForMessage,
	entriesForMessage,
	type LedgerEntry,
	type LedgerGate
} from '$lib/fiduciary/ledger';

export interface ChatMessage {
	/** Stable client-side identity for list keying; never changes after creation.
	 *  (`id` tracks the backend message id and CAN change when the start/complete
	 *  frame lands, so it must not be used as the {#each} key.) */
	key: string;
	id: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	routed_inference_tier?: number | null;
	status?: 'streaming' | 'done' | 'error' | 'awaiting_confirmation' | 'awaiting_auth';
	error?: string;
	/** Machine-readable code accompanying `error` when the backend supplied one
	 *  (SSE error-frame `code` / api error-envelope `detail.code`). */
	errorCode?: string;
	citations?: Citation[];
	/** External-source provenance (case law consulted), lazy-fetched post-stream (PR6c). */
	sources?: ToolSource[];
	/** Per-turn fiduciary ledger entries (Slice 1), lazy-fetched post-stream. */
	ledgerEntries?: LedgerEntry[];
	/** Per-turn fiduciary gate verdict (Slice 1), lazy-fetched post-stream. */
	ledgerGate?: LedgerGate | null;
	anonymized?: boolean;
	/** Slugs of the skills the backend reported as applied to this assistant turn. */
	applied_skills?: string[];
	/** File ids the backend reported as applied to this assistant turn (turn-scoped echo). */
	applied_file_ids?: string[];
	/** Destructive/requires_confirmation tool-call gate payload (status 'awaiting_confirmation'). */
	confirmation?: {
		pending_call_id: string;
		provider: string;
		tool: string;
		function_name: string;
		args_summary: Record<string, unknown>;
		tier: number;
		destructive: boolean;
	};
	/** OAuth MCP server the user must connect (status 'awaiting_auth'). */
	mcpAuth?: { server: string; authorize_url: string };
}

export function createChatStream(chatId: string, initial: ChatMessage[] = []) {
	let messages = $state<ChatMessage[]>(initial);
	let status = $state<'idle' | 'streaming' | 'error'>('idle');
	let controller: AbortController | null = null;

	function setError(idx: number, msg: string, code?: string) {
		messages[idx].status = 'error';
		messages[idx].error = msg;
		messages[idx].errorCode = code;
		status = 'error';
	}

	function applyFrame(idx: number, frame: StreamFrame) {
		const m = messages[idx];
		if (frame.type === 'start') {
			m.id = frame.lq_ai_message_id;
		} else if (frame.type === 'delta') {
			m.content += frame.delta;
			if (frame.routed_inference_tier != null)
				m.routed_inference_tier = frame.routed_inference_tier;
			if (frame.applied_skills) m.applied_skills = frame.applied_skills;
			if (frame.applied_file_ids) m.applied_file_ids = frame.applied_file_ids;
		} else if (frame.type === 'complete') {
			m.id = frame.message.id ?? m.id;
			m.content = frame.message.content ?? m.content;
			const tier = frame.message.routed_inference_tier ?? frame.routed_inference_tier;
			if (tier != null) m.routed_inference_tier = tier;
			// applied_skills and applied_file_ids are emitted at the top level of the
			// complete frame by the backend (not inside message), mirroring applied_skills.
			if (frame.applied_skills) m.applied_skills = frame.applied_skills;
			if (frame.applied_file_ids) m.applied_file_ids = frame.applied_file_ids;
			m.status = 'done';
		} else if (frame.type === 'tool_confirmation_required') {
			m.confirmation = {
				pending_call_id: frame.pending_call_id,
				provider: frame.provider,
				tool: frame.tool,
				function_name: frame.function_name,
				args_summary: frame.args_summary,
				tier: frame.tier,
				destructive: frame.destructive
			};
			m.status = 'awaiting_confirmation';
		} else if (frame.type === 'mcp_authorization_required') {
			m.mcpAuth = { server: frame.server, authorize_url: frame.authorize_url };
			m.status = 'awaiting_auth';
		} else if (frame.type === 'error') {
			setError(idx, frame.message, frame.code);
		}
	}

	let lastUserContent = '';
	let lastModel = 'smart';
	let lastSkills: string[] = [];
	let lastSkillInputs: Record<string, Record<string, unknown>> = {};
	let lastFileIds: string[] = [];

	// Citations live in the M2-A2 relational table, not the SSE complete frame.
	// Fetch them by message id once the assistant turn is persisted (one retry to
	// cover the persist/fetch race).
	async function loadCitations(idx: number) {
		const id = messages[idx].id;
		if (!id || id === 'pending') return;
		if (!hasCitationMarkers(messages[idx].content)) return;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetch(`/chats/${chatId}/messages/${id}/citations`);
				if (!res.ok) {
					if (import.meta.env.DEV) console.warn(`loadCitations: ${res.status} for message ${id}`);
					return;
				}
				const cites = (await res.json()) as Citation[];
				// attempt 0: only accept a non-empty result (covers the persist/fetch race); attempt 1: accept whatever (give up).
				if (cites.length > 0 || attempt === 1) {
					messages[idx].citations = cites;
					return;
				}
			} catch {
				return;
			}
			await new Promise((r) => setTimeout(r, 400));
		}
	}

	// External-source provenance lives in the message_tool_sources table (PR6c),
	// not the SSE frame. Unlike citations there is no in-text marker, so fetch
	// unconditionally once the turn is persisted. A case-law turn's tool round-trip
	// means the row is committed well before the stream completes, so a single
	// attempt suffices; on the rare miss, sources appear on the next load.
	async function loadSources(idx: number) {
		const id = messages[idx].id;
		if (!id || id === 'pending') return;
		try {
			const res = await fetch(`/chats/${chatId}/messages/${id}/sources`);
			if (!res.ok) {
				if (import.meta.env.DEV) console.warn(`loadSources: ${res.status} for message ${id}`);
				return;
			}
			const srcs = parseToolSources(await res.json());
			if (srcs.length > 0) messages[idx].sources = srcs; // last-known-good: never clobber with []
		} catch {
			/* non-blocking — panel simply absent */
		}
	}

	// The per-turn fiduciary ledger (Slice 1) lives at /chats/{id}/ledger, correlated
	// by message_id. Fetch it once the turn is persisted; last-known-good like sources.
	async function loadLedger(idx: number) {
		const id = messages[idx].id;
		if (!id || id === 'pending') return;
		try {
			const res = await fetch(`/chats/${chatId}/ledger?message_id=${id}`);
			if (!res.ok) return;
			const ledger = parseLedger(await res.json());
			const entries = entriesForMessage(ledger, id);
			if (entries.length > 0) messages[idx].ledgerEntries = entries;
			const gate = gateForMessage(ledger, id);
			if (gate) messages[idx].ledgerGate = gate;
		} catch {
			/* non-blocking */
		}
	}

	// Anonymization is recorded on the inference receipt, correlated by message_id.
	async function loadAnonymization(idx: number) {
		const id = messages[idx].id;
		if (!id || id === 'pending' || messages[idx].status === 'error') return;
		try {
			// M1: chats are bounded, so scanning the full inference list is fine. A
			// message_id-scoped query would scale better for long chats (future).
			const res = await fetch(`/chats/${chatId}/receipts?event_kinds=inference`);
			if (!res.ok) {
				if (import.meta.env.DEV)
					console.warn(`loadAnonymization: ${res.status} for chat ${chatId}`);
				return;
			}
			const map = anonymizedByMessage((await res.json()) as ReceiptEvent[]);
			if (map.has(id)) messages[idx].anonymized = map.get(id);
		} catch {
			/* non-blocking — badge simply absent */
		}
	}

	// Read an SSE Response into the assistant message at `idx`. Shared by the
	// initial send/retry and the confirmation resume. A gate frame
	// (tool_confirmation_required / mcp_authorization_required) ends the read and
	// leaves a non-'done' status, so citations/anonymization are not fetched.
	async function consumeStream(idx: number, res: Response) {
		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		const parser = createSseParser();
		let ended = false;
		try {
			while (!ended) {
				const { value, done } = await reader.read();
				if (done) break;
				for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
					if (frame.type === 'done') {
						ended = true;
						break;
					}
					applyFrame(idx, frame);
					if (
						frame.type === 'error' ||
						frame.type === 'tool_confirmation_required' ||
						frame.type === 'mcp_authorization_required'
					) {
						ended = true;
						break;
					}
				}
			}
			if (!ended) {
				for (const frame of parser.push(decoder.decode())) {
					if (frame.type === 'done') break;
					applyFrame(idx, frame);
					if (frame.type === 'error') break;
				}
			}
		} finally {
			reader.cancel().catch(() => {});
		}
		if (messages[idx].status === 'streaming') messages[idx].status = 'done';
		if (status === 'streaming') status = 'idle';
		if (messages[idx].status === 'done') {
			await loadCitations(idx);
			await loadSources(idx);
			await loadLedger(idx);
			await loadAnonymization(idx);
		}
	}

	// Stream a response into the assistant message at `idx` (already present and
	// reset to a streaming state by the caller). Shared by send() and retry().
	async function runStream(
		idx: number,
		content: string,
		model: string,
		skills: string[],
		skillInputs: Record<string, Record<string, unknown>>,
		fileIds: string[],
		setSticky?: boolean
	): Promise<boolean> {
		status = 'streaming';
		controller = new AbortController();
		let accepted = false;
		try {
			const body: {
				content: string;
				model: string;
				skills?: string[];
				skill_inputs?: Record<string, Record<string, unknown>>;
				file_ids?: string[];
				set_sticky?: boolean;
			} = { content, model };
			if (skills.length) body.skills = skills;
			if (Object.keys(skillInputs).length) body.skill_inputs = skillInputs;
			if (fileIds.length) body.file_ids = fileIds;
			if (setSticky !== undefined) body.set_sticky = setSticky;
			const res = await fetch(`/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				// Surface the backend's own error envelope (FastAPI `detail` — a plain
				// string or {code, message}) instead of a canned line when one is present.
				let msg = 'Could not reach the model. Please try again.';
				let code: string | undefined;
				try {
					const env = (await res.json()) as { detail?: unknown };
					if (typeof env.detail === 'string' && env.detail) {
						msg = env.detail;
					} else if (env.detail && typeof env.detail === 'object') {
						const d = env.detail as { code?: unknown; message?: unknown };
						if (typeof d.message === 'string' && d.message) msg = d.message;
						if (typeof d.code === 'string' && d.code) code = d.code;
					}
				} catch {
					/* keep the generic message */
				}
				setError(idx, msg, code);
				return false;
			}
			accepted = true; // POST accepted — set_sticky (if any) reached the backend
			await consumeStream(idx, res);
			return true;
		} catch (e) {
			if ((e as Error).name === 'AbortError') {
				messages[idx].status = 'done';
				status = 'idle';
			} else {
				// Keep the underlying failure visible instead of hiding it behind a canned line.
				const detail = (e as Error).message;
				setError(
					idx,
					detail
						? `The connection was lost (${detail}). Please try again.`
						: 'The connection was lost. Please try again.'
				);
			}
			return accepted; // an abort AFTER acceptance still dispatched set_sticky
		} finally {
			controller = null;
		}
	}

	async function send(
		content: string,
		model = 'smart',
		skills: string[] = [],
		skillInputs: Record<string, Record<string, unknown>> = {},
		fileIds: string[] = [],
		setSticky?: boolean
	): Promise<boolean> {
		if (status === 'streaming') return false;
		lastUserContent = content;
		lastModel = model;
		lastSkills = skills;
		lastSkillInputs = skillInputs;
		lastFileIds = fileIds;
		messages = [
			...messages,
			{ key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
			{
				key: crypto.randomUUID(),
				id: 'pending',
				role: 'assistant',
				content: '',
				status: 'streaming'
			}
		];
		return await runStream(
			messages.length - 1,
			content,
			model,
			skills,
			skillInputs,
			fileIds,
			setSticky
		);
	}

	// Re-run the last exchange in place (no duplicate user/assistant turns): reset
	// the trailing assistant message and stream a fresh response for it.
	async function retry() {
		if (status === 'streaming') return;
		const idx = messages.length - 1;
		if (idx < 0 || messages[idx].role !== 'assistant') return;
		messages[idx].content = '';
		messages[idx].error = undefined;
		messages[idx].errorCode = undefined;
		messages[idx].routed_inference_tier = undefined;
		messages[idx].citations = undefined;
		messages[idx].sources = undefined;
		messages[idx].ledgerEntries = undefined;
		messages[idx].ledgerGate = undefined;
		messages[idx].anonymized = undefined;
		messages[idx].applied_skills = undefined;
		messages[idx].applied_file_ids = undefined;
		messages[idx].status = 'streaming';
		// NB: no set_sticky on retry — the sticky set is already persisted server-side; re-snapshotting
		// on a retry would be wrong.
		await runStream(idx, lastUserContent, lastModel, lastSkills, lastSkillInputs, lastFileIds);
	}

	// Resume a turn paused at a confirmation gate: POST the decision and stream the
	// resumed turn into the SAME assistant message (idx).
	async function decide(idx: number, decision: 'approve' | 'deny') {
		if (status === 'streaming') return;
		const m = messages[idx];
		const pendingId = m.confirmation?.pending_call_id;
		if (!pendingId) return;
		m.confirmation = undefined;
		m.error = undefined;
		m.errorCode = undefined;
		m.status = 'streaming';
		status = 'streaming';
		controller = new AbortController();
		try {
			const res = await fetch(`/chats/${chatId}/tool-calls/${pendingId}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ decision }),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				setError(
					idx,
					res.status === 404 || res.status === 409
						? 'This confirmation expired — please re-send your message.'
						: 'Could not resume the turn. Please try again.'
				);
				return;
			}
			await consumeStream(idx, res);
		} catch (e) {
			if ((e as Error).name === 'AbortError') {
				messages[idx].status = 'done';
				status = 'idle';
			} else {
				setError(idx, 'The connection was lost. Please try again.');
			}
		} finally {
			controller = null;
		}
	}

	function stop() {
		controller?.abort();
	}

	return {
		get messages() {
			return messages;
		},
		get status() {
			return status;
		},
		send,
		retry,
		decide,
		stop
	};
}
