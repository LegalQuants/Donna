import { describe, it, expect } from 'vitest';
import { parseLedger, gateForMessage, entriesForMessage } from './ledger';

// Real payload shapes from the integration doc §2.4.
const RAW = {
	chat_id: '6f1c2a90-1111-4aaa-bbbb-000000000001',
	entries: [
		{
			id: 'a1000000-0000-4000-8000-000000000001',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'kb_document',
			verification_status: 'exact_match',
			confidence: 1.0,
			provider: null,
			retrieved_at: null,
			treatment_id: null,
			created_at: '2026-06-30T12:00:00+00:00',
			source: {
				kind: 'kb_document',
				source_file_id: 'c3000000-0000-4000-8000-000000000003',
				passages: [{ text: 'This Agreement shall be governed by', offset_start: 0, offset_end: 35, page: null }]
			}
		},
		{
			id: 'a1000000-0000-4000-8000-000000000004',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'caselaw',
			verification_status: 'tolerant_match',
			confidence: 0.9,
			provider: 'courtlistener',
			retrieved_at: '2026-06-30T11:59:00+00:00',
			treatment_id: 'd4000000-0000-4000-8000-000000000005',
			created_at: '2026-06-30T12:00:01+00:00',
			source: {
				kind: 'caselaw',
				opinion_id: 2812209,
				cluster_id: 654321,
				passages: [{ text: 'The court held that...', offset_start: 40, offset_end: 120 }]
			}
		},
		{
			id: 'a1000000-0000-4000-8000-000000000006',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'caselaw',
			verification_status: 'provenance',
			confidence: null,
			source: { kind: 'caselaw', label: 'Miranda v. Arizona', subtitle: 'U.S. Supreme Court', url: 'https://x', external_ref: '10648', tool: 'search_case_law' }
		}
	],
	gates: [
		{ message_id: 'b2000000-0000-4000-8000-000000000002', gate_status: 'supported_only', pass_count: 1, supported_count: 0, fail_count: 0, total_assertions: 1, confidence: 0.95, created_at: '2026-06-30T12:00:02+00:00' }
	]
};

describe('parseLedger', () => {
	it('parses entries, gates, and branches source by kind', () => {
		const l = parseLedger(RAW);
		expect(l.entries).toHaveLength(3);
		expect(l.gates).toHaveLength(1);
		const kb = l.entries[0];
		expect(kb.source_kind).toBe('kb_document');
		expect(kb.source?.source_file_id).toBe('c3000000-0000-4000-8000-000000000003');
		expect(kb.source?.passages[0].text).toBe('This Agreement shall be governed by');
		const cl = l.entries[1];
		expect(cl.source?.opinion_id).toBe(2812209);
		expect(cl.treatment_id).toBe('d4000000-0000-4000-8000-000000000005');
		const tool = l.entries[2];
		expect(tool.verification_status).toBe('provenance');
		expect(tool.source?.label).toBe('Miranda v. Arizona');
		expect(tool.source?.passages).toEqual([]);
	});

	it('parses the gate scalars', () => {
		const g = parseLedger(RAW).gates[0];
		expect(g.gate_status).toBe('supported_only');
		expect(g.total_assertions).toBe(1);
		expect(g.confidence).toBe(0.95);
	});

	it('drops entries with no id and tolerates a malformed envelope', () => {
		expect(parseLedger(null)).toEqual({ entries: [], gates: [] });
		expect(parseLedger({ entries: 'no', gates: 5 })).toEqual({ entries: [], gates: [] });
		const l = parseLedger({ entries: [{ source_kind: 'kb_document' }, { id: 'x', source_kind: 'caselaw' }] });
		expect(l.entries).toHaveLength(1);
		expect(l.entries[0].id).toBe('x');
		expect(l.entries[0].source).toBeNull();
	});

	it('groups by message_id', () => {
		const l = parseLedger(RAW);
		const mid = 'b2000000-0000-4000-8000-000000000002';
		expect(entriesForMessage(l, mid)).toHaveLength(3);
		expect(gateForMessage(l, mid)?.gate_status).toBe('supported_only');
		expect(gateForMessage(l, 'nope')).toBeNull();
	});
});
