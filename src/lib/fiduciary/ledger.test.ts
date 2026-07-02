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
				passages: [
					{
						text: 'This Agreement shall be governed by',
						offset_start: 0,
						offset_end: 35,
						page: null
					}
				]
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
			},
			treatment: {
				cited_by_count: 214,
				as_of: '2026-06-30T11:58:00+00:00',
				derived_method: 'court_ai_ml_v1',
				citing: [
					{
						opinion_id: 1234567,
						cluster_id: 111111,
						case_name: 'Plaintiff v. Defendant',
						court: 'U.S. Supreme Court',
						date_filed: '2024-01-15'
					},
					{
						opinion_id: 7654321,
						cluster_id: 222222,
						case_name: 'Another v. Party',
						court: 'D.C. Circuit',
						date_filed: '2023-06-20'
					}
				],
				strongest_negative_class: 'overruled',
				judged_count: null,
				judge_as_of: null,
				per_class_counts: {
					overruled: 1,
					reversed: 3,
					limited: 2,
					distinguished: 8
				},
				case_confidence: 0.87,
				signals: [
					{
						citing_opinion_id: 1234567,
						classification: 'overruled',
						confidence: 0.92,
						justification: 'Court explicitly overruled this precedent'
					},
					{
						citing_opinion_id: 7654321,
						classification: 'distinguished',
						confidence: 0.78,
						justification: 'Court noted factual differences'
					}
				]
			}
		},
		{
			id: 'a1000000-0000-4000-8000-000000000006',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'caselaw',
			verification_status: 'provenance',
			confidence: null,
			source: {
				kind: 'caselaw',
				label: 'Miranda v. Arizona',
				subtitle: 'U.S. Supreme Court',
				url: 'https://x',
				external_ref: '10648',
				tool: 'search_case_law'
			}
		}
	],
	gates: [
		{
			message_id: 'b2000000-0000-4000-8000-000000000002',
			gate_status: 'supported_only',
			pass_count: 1,
			supported_count: 0,
			fail_count: 0,
			total_assertions: 1,
			confidence: 0.95,
			created_at: '2026-06-30T12:00:02+00:00'
		}
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
		const l = parseLedger({
			entries: [{ source_kind: 'kb_document' }, { id: 'x', source_kind: 'caselaw' }]
		});
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

	it('parses treatment with full data (cited_by_count, signals, per_class_counts)', () => {
		const l = parseLedger(RAW);
		const entry = l.entries[1];
		expect(entry.treatment).not.toBeNull();
		expect(entry.treatment?.cited_by_count).toBe(214);
		expect(entry.treatment?.strongest_negative_class).toBe('overruled');
		expect(entry.treatment?.as_of).toBe('2026-06-30T11:58:00+00:00');
		expect(entry.treatment?.derived_method).toBe('court_ai_ml_v1');
		expect(entry.treatment?.case_confidence).toBe(0.87);
		expect(entry.treatment?.signals).toHaveLength(2);
		expect(entry.treatment?.signals[0].classification).toBe('overruled');
		expect(entry.treatment?.signals[0].confidence).toBe(0.92);
		expect(entry.treatment?.signals[1].classification).toBe('distinguished');
		expect(entry.treatment?.per_class_counts?.overruled).toBe(1);
		expect(entry.treatment?.per_class_counts?.distinguished).toBe(8);
		expect(entry.treatment?.citing).toHaveLength(2);
		expect(entry.treatment?.citing[0].case_name).toBe('Plaintiff v. Defendant');
	});

	it('parses treatment as null for entries without treatment data', () => {
		const l = parseLedger(RAW);
		const entry0 = l.entries[0];
		expect(entry0.treatment).toBeNull();
		const entry2 = l.entries[2];
		expect(entry2.treatment).toBeNull();
	});

	it('drops malformed citing rows and non-numeric per_class_counts values', () => {
		const withDefects = {
			entries: [
				{
					id: 'test-1',
					source_kind: 'caselaw',
					treatment: {
						cited_by_count: 100,
						citing: [
							{
								opinion_id: 123,
								cluster_id: 456,
								case_name: 'Valid Case',
								court: 'Court',
								date_filed: '2024-01-01'
							},
							'not an object',
							null
						],
						per_class_counts: {
							valid: 5,
							invalid: 'not a number',
							another: 10,
							also_invalid: true,
							ok: 3
						},
						signals: []
					}
				}
			]
		};
		const l = parseLedger(withDefects);
		const entry = l.entries[0];
		expect(entry.treatment?.citing).toHaveLength(1);
		expect(entry.treatment?.citing[0].case_name).toBe('Valid Case');
		expect(entry.treatment?.per_class_counts).toEqual({
			valid: 5,
			another: 10,
			ok: 3
		});
	});

	it('drops signals rows missing classification', () => {
		const withDefects = {
			entries: [
				{
					id: 'test-2',
					source_kind: 'caselaw',
					treatment: {
						cited_by_count: 50,
						signals: [
							{
								citing_opinion_id: 111,
								classification: 'valid',
								confidence: 0.9,
								justification: 'This is good'
							},
							{
								citing_opinion_id: 222,
								confidence: 0.8,
								justification: 'Missing classification'
							},
							{
								citing_opinion_id: 333,
								classification: '',
								confidence: 0.7
							},
							{
								citing_opinion_id: 444,
								classification: 'good',
								confidence: 0.85
							}
						],
						citing: [],
						per_class_counts: {}
					}
				}
			]
		};
		const l = parseLedger(withDefects);
		const entry = l.entries[0];
		expect(entry.treatment?.signals).toHaveLength(2);
		expect(entry.treatment?.signals[0].classification).toBe('valid');
		expect(entry.treatment?.signals[1].classification).toBe('good');
	});

	it('handles treatment as null (not yet derived)', () => {
		const withoutTreatment = {
			entries: [
				{
					id: 'test-3',
					source_kind: 'caselaw',
					treatment: null
				}
			]
		};
		const l = parseLedger(withoutTreatment);
		expect(l.entries[0].treatment).toBeNull();
	});
});
