import {
	parseReceipt,
	parseSessionSummary,
	type SessionReceipt,
	type SessionSummary
} from './types';
import type { FindingItem, RunMemoryItem } from './findings';

const TERMINAL = new Set(['completed', 'halted', 'failed']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PollOpts {
	pollMs?: number;
}

/** Polls the BFF proxy for one session until it reaches a terminal status.
 *  Mirrors the runFlow.svelte.ts pattern (rune state + sleep loop).
 *
 *  Contract:
 *  - `done` is true ONLY when polling ended on its own — a terminal status
 *    OR an error. An external `stop()` (e.g. unmount) leaves `done` false.
 *  - When `done` is true, check `error`: null = clean terminal stop, non-null
 *    = stopped because of a transport/parse failure. */
export function createSessionPoll(id: string, opts: PollOpts = {}) {
	const pollMs = opts.pollMs ?? 2000;
	let session = $state<SessionSummary | null>(null);
	let receipt = $state<SessionReceipt | null>(null);
	let findings = $state<FindingItem[] | null>(null);
	let findingsTotal = $state<number | null>(null);
	let memories = $state<RunMemoryItem[] | null>(null);
	let memoriesTotal = $state<number | null>(null);
	let done = $state(false);
	let error = $state<string | null>(null);
	let running = false;

	/** One poll. Returns true when polling should stop (terminal status or error). */
	async function tick(): Promise<boolean> {
		const res = await fetch(`/automations/${id}`);
		if (!res.ok) {
			error = 'Lost contact with the session.';
			return true;
		}
		const body = (await res.json()) as {
			session?: unknown;
			receipt?: unknown;
			findings?: unknown;
			findings_total?: unknown;
			memories?: unknown;
			memories_total?: unknown;
		};
		const parsed = parseSessionSummary(body.session);
		if (!parsed) {
			error = 'Received a malformed session response.';
			return true;
		}
		session = parsed;
		receipt = parseReceipt(body.receipt);
		// Last-known-good retention: only overwrite when the incoming value is
		// non-null; a null incoming value (e.g. backend findings fetch degraded)
		// must not blank data that was successfully received in an earlier tick.
		const incomingFindings = Array.isArray(body.findings) ? (body.findings as FindingItem[]) : null;
		if (incomingFindings !== null) findings = incomingFindings;
		const incomingFindingsTotal =
			typeof body.findings_total === 'number' ? body.findings_total : null;
		if (incomingFindingsTotal !== null) findingsTotal = incomingFindingsTotal;
		const incomingMemories = Array.isArray(body.memories)
			? (body.memories as RunMemoryItem[])
			: null;
		if (incomingMemories !== null) memories = incomingMemories;
		const incomingMemoriesTotal =
			typeof body.memories_total === 'number' ? body.memories_total : null;
		if (incomingMemoriesTotal !== null) memoriesTotal = incomingMemoriesTotal;
		return TERMINAL.has(parsed.status);
	}

	async function start() {
		if (running) return;
		running = true;
		done = false;
		error = null;
		while (running) {
			const finished = await tick();
			if (finished) {
				done = true;
				break;
			}
			await sleep(pollMs);
		}
		running = false;
	}

	function stop() {
		running = false;
	}

	return {
		get session() {
			return session;
		},
		get receipt() {
			return receipt;
		},
		get findings() {
			return findings;
		},
		get findingsTotal() {
			return findingsTotal;
		},
		get memories() {
			return memories;
		},
		get memoriesTotal() {
			return memoriesTotal;
		},
		get done() {
			return done;
		},
		get error() {
			return error;
		},
		start,
		stop
	};
}
