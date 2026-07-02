// src/lib/fiduciary/treatmentPoll.svelte.ts
// Capped, last-known-good poller that re-fetches a chat turn's ledger while any
// caselaw entry's treatment is still deriving (treatment === null). Chat-specific
// (kept out of the shared FiduciaryReceipt component). Mirrors pollSession.svelte.ts.
import { parseLedger, entriesForMessage, type LedgerEntry } from './ledger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stillDeriving(entries: LedgerEntry[]): boolean {
	return entries.some((e) => e.source?.kind === 'caselaw' && e.treatment === null);
}

export function createTreatmentPoll(
	chatId: string,
	messageId: string,
	opts: { intervalMs?: number; maxAttempts?: number; fetchFn?: typeof fetch } = {}
) {
	const intervalMs = opts.intervalMs ?? 5000;
	const maxAttempts = opts.maxAttempts ?? 6;
	const doFetch = opts.fetchFn ?? fetch;
	let entries = $state<LedgerEntry[] | null>(null);
	let done = $state(false);
	let running = false;

	async function tick(): Promise<boolean> {
		try {
			const res = await doFetch(`/chats/${chatId}/ledger?message_id=${messageId}`);
			if (!res.ok) return true;
			const next = entriesForMessage(parseLedger(await res.json()), messageId);
			if (next.length > 0) entries = next; // last-known-good
			return !stillDeriving(next);
		} catch {
			return true;
		}
	}

	async function start() {
		if (running) return;
		running = true;
		done = false;
		let attempts = 0;
		while (running && attempts < maxAttempts) {
			const finished = await tick();
			if (finished) break;
			attempts++;
			await sleep(intervalMs);
		}
		running = false;
		done = true;
	}
	function stop() {
		running = false;
	}

	return {
		get entries() {
			return entries;
		},
		get done() {
			return done;
		},
		start,
		stop
	};
}
