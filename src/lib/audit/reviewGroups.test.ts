// src/lib/audit/reviewGroups.test.ts
import { describe, it, expect } from 'vitest';
import { groupChatLedger } from './reviewGroups';
import type { Ledger, LedgerEntry, LedgerGate } from '$lib/fiduciary/ledger';

function entry(id: string, message_id: string | null, created_at: string | null): LedgerEntry {
	return {
		id,
		message_id,
		source_kind: 'caselaw',
		verification_status: 'exact_match',
		confidence: 1,
		provider: 'courtlistener',
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at,
		source: null
	};
}
function gate(message_id: string | null): LedgerGate {
	return {
		message_id,
		gate_status: 'fiduciary_grade',
		pass_count: 1,
		supported_count: 0,
		fail_count: 0,
		total_assertions: 1,
		confidence: 1,
		created_at: null
	};
}

describe('groupChatLedger', () => {
	it('groups by message_id and associates each gate', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', 'mA', '2026-07-03T10:00:00Z'),
				entry('e2', 'mA', '2026-07-03T10:00:01Z')
			],
			gates: [gate('mA')]
		};
		const groups = groupChatLedger(ledger);
		expect(groups).toHaveLength(1);
		expect(groups[0].messageId).toBe('mA');
		expect(groups[0].entries.map((e) => e.id)).toEqual(['e1', 'e2']);
		expect(groups[0].gate?.gate_status).toBe('fiduciary_grade');
	});

	it('orders groups by earliest created_at', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', 'mLate', '2026-07-03T12:00:00Z'),
				entry('e2', 'mEarly', '2026-07-03T09:00:00Z')
			],
			gates: []
		};
		const groups = groupChatLedger(ledger);
		expect(groups.map((g) => g.messageId)).toEqual(['mEarly', 'mLate']);
	});

	it('collapses null-message entries into a single trailing group with no gate', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', null, null),
				entry('e2', 'mA', '2026-07-03T09:00:00Z'),
				entry('e3', null, null)
			],
			gates: [gate('mA')]
		};
		const groups = groupChatLedger(ledger);
		expect(groups.map((g) => g.messageId)).toEqual(['mA', null]);
		const trailing = groups[groups.length - 1];
		expect(trailing.entries.map((e) => e.id)).toEqual(['e1', 'e3']);
		expect(trailing.gate).toBeNull();
	});

	it('returns [] for an empty ledger', () => {
		expect(groupChatLedger({ entries: [], gates: [] })).toEqual([]);
	});
});
