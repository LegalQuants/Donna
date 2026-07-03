// src/lib/audit/reviewGroups.ts
// Pure grouping of a chat ledger into per-turn review groups. A chat reviewer
// renders one FiduciaryReceipt + gate pill per message_id. Entries with a null
// message_id (rare/malformed) collapse into a single trailing "unattributed"
// group so nothing is silently dropped.
import type { Ledger, LedgerEntry, LedgerGate } from '$lib/fiduciary/ledger';
import { gateForMessage } from '$lib/fiduciary/ledger';

export interface ReviewGroup {
	messageId: string | null;
	entries: LedgerEntry[];
	gate: LedgerGate | null;
}

function earliest(entries: LedgerEntry[]): string | null {
	let min: string | null = null;
	for (const e of entries) {
		if (e.created_at === null) continue;
		if (min === null || e.created_at < min) min = e.created_at;
	}
	return min;
}

export function groupChatLedger(ledger: Ledger): ReviewGroup[] {
	const byMessage = new Map<string, LedgerEntry[]>();
	const unattributed: LedgerEntry[] = [];
	for (const e of ledger.entries) {
		if (e.message_id === null) {
			unattributed.push(e);
			continue;
		}
		const list = byMessage.get(e.message_id) ?? [];
		list.push(e);
		byMessage.set(e.message_id, list);
	}

	const attributed: ReviewGroup[] = [...byMessage.entries()].map(([messageId, entries]) => ({
		messageId,
		entries,
		gate: gateForMessage(ledger, messageId)
	}));

	// Order by each group's earliest created_at; groups with no timestamp sort last.
	attributed.sort((a, b) => {
		const ea = earliest(a.entries);
		const eb = earliest(b.entries);
		if (ea === null && eb === null) return 0;
		if (ea === null) return 1;
		if (eb === null) return -1;
		return ea < eb ? -1 : ea > eb ? 1 : 0;
	});

	if (unattributed.length > 0) {
		attributed.push({ messageId: null, entries: unattributed, gate: null });
	}
	return attributed;
}
