import { describe, it, expect } from 'vitest';
import {
	buildProvenanceExport,
	ledgerSourceTitle,
	PROVENANCE_DISCLAIMER
} from './provenanceExport';
import type { LedgerEntry, LedgerGate, LedgerTreatment } from './ledger';

function source(over: Partial<NonNullable<LedgerEntry['source']>> = {}) {
	return {
		kind: 'kb_document',
		source_file_id: 'f1',
		opinion_id: null,
		cluster_id: null,
		external_ref: null,
		provider: null,
		label: null,
		subtitle: null,
		url: null,
		tool: null,
		passages: [] as NonNullable<LedgerEntry['source']>['passages'],
		...over
	};
}
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
	return {
		id: 'e1',
		message_id: 'm1',
		source_kind: 'kb_document',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at: null,
		source: source(),
		...over
	};
}
const gate: LedgerGate = {
	message_id: 'm1',
	gate_status: 'fiduciary_grade',
	pass_count: 1,
	supported_count: 0,
	fail_count: 0,
	total_assertions: 2,
	confidence: 0.99,
	created_at: null
};
// Not annotated as `ProvenanceMeta` — that would widen `source` to the full
// discriminated union and break the direct `.session_id` access below.
const sessionMeta = {
	source: {
		type: 'autonomous_session' as const,
		session_id: 'a1b2c3d4-5555-6666-7777-888899990000'
	},
	exported_at: '2026-07-02T10:30:00.000Z'
};

describe('buildProvenanceExport — JSON envelope', () => {
	it('wraps entries + gate in a self-describing, disclaimer-bearing envelope', () => {
		const out = buildProvenanceExport(
			[
				entry({
					source: source({
						label: 'Master Agreement',
						passages: [
							{
								text: 'indemnity',
								offset_start: 0,
								offset_end: 9,
								page: null,
								verified: true,
								method: 'exact_match'
							}
						]
					})
				})
			],
			gate,
			sessionMeta
		);
		const env = JSON.parse(out.json);
		expect(env.kind).toBe('provenance_record');
		expect(env.version).toBe(1);
		expect(env.disclaimer).toBe(PROVENANCE_DISCLAIMER);
		expect(env.source).toEqual({
			type: 'autonomous_session',
			session_id: sessionMeta.source.session_id
		});
		expect(env.exported_at).toBe('2026-07-02T10:30:00.000Z');
		expect(env.gate.gate_status).toBe('fiduciary_grade');
		expect(env.entries).toHaveLength(1);
		expect(env.entries[0].source.label).toBe('Master Agreement');
	});
	it('serializes a null gate as null', () => {
		const env = JSON.parse(buildProvenanceExport([entry()], null, sessionMeta).json);
		expect(env.gate).toBeNull();
	});
});

describe('buildProvenanceExport — Markdown', () => {
	it('renders the disclaimer, source, verdict, a quoted source, and its passage', () => {
		const md = buildProvenanceExport(
			[
				entry({
					source: source({
						label: 'Master Agreement',
						passages: [
							{
								text: 'indemnity clause',
								offset_start: 0,
								offset_end: 9,
								page: null,
								verified: true,
								method: 'exact_match'
							}
						]
					})
				})
			],
			gate,
			sessionMeta
		).markdown;
		expect(md).toContain('# Provenance record');
		expect(md).toContain(`> ${PROVENANCE_DISCLAIMER}`);
		expect(md).toContain(`Autonomous session ${sessionMeta.source.session_id}`);
		expect(md).toContain('2026-07-02T10:30:00.000Z');
		expect(md).toContain('Fiduciary-grade');
		expect(md).toContain('## Sources cited');
		expect(md).toContain('Master Agreement');
		expect(md).toContain('> "indemnity clause"');
	});
	it('includes a treatment line for a caselaw entry and a Consulted section for provenance rows', () => {
		const treatment: LedgerTreatment = {
			cited_by_count: 214,
			as_of: null,
			derived_method: 'graph',
			citing: [],
			strongest_negative_class: 'distinguished',
			judged_count: null,
			judge_as_of: null,
			per_class_counts: {},
			case_confidence: null,
			signals: [
				{
					citing_opinion_id: 9,
					classification: 'distinguished',
					confidence: null,
					justification: 'narrow facts'
				}
			]
		};
		const md = buildProvenanceExport(
			[
				entry({
					verification_status: 'exact_match',
					source: source({
						kind: 'caselaw',
						source_file_id: null,
						opinion_id: 42,
						label: 'Roe v. Roe',
						passages: []
					}),
					treatment
				}),
				entry({
					id: 'e2',
					verification_status: 'provenance',
					source: source({ label: 'Consulted doc', subtitle: 'p. 3' })
				})
			],
			gate,
			sessionMeta
		).markdown;
		expect(md).toContain('Cited by 214');
		expect(md).toContain('distinguished');
		expect(md).toContain('## Consulted, not quoted');
		expect(md).toContain('Consulted doc');
	});
});

describe('baseFilename', () => {
	it('derives a session filename with a short id and the export date', () => {
		expect(buildProvenanceExport([entry()], gate, sessionMeta).baseFilename).toBe(
			'provenance-session-a1b2c3d4-2026-07-02'
		);
	});
	it('derives a chat filename from the message id', () => {
		const out = buildProvenanceExport([entry()], gate, {
			source: {
				type: 'chat_turn',
				chat_id: 'chat-9',
				message_id: 'deadbeef-1111-2222-3333-444455556666'
			},
			exported_at: '2026-07-02T09:00:00.000Z'
		});
		expect(out.baseFilename).toBe('provenance-chat-deadbeef-2026-07-02');
	});
});

describe('ledgerSourceTitle', () => {
	it('prefers an explicit label', () => {
		expect(ledgerSourceTitle(entry({ source: source({ label: 'My Doc' }) }))).toBe('My Doc');
	});
	it('names a kb document, a caselaw opinion, an external ref, and a bare kind', () => {
		expect(ledgerSourceTitle(entry({ source: source({ kind: 'kb_document' }) }))).toBe(
			'Knowledge-base document'
		);
		expect(
			ledgerSourceTitle(
				entry({ source: source({ kind: 'caselaw', source_file_id: null, opinion_id: 42 }) })
			)
		).toBe('Opinion #42');
		expect(
			ledgerSourceTitle(
				entry({
					source: source({
						kind: 'authority',
						source_file_id: null,
						external_ref: '17 U.S.C. § 106'
					})
				})
			)
		).toBe('17 U.S.C. § 106');
		expect(
			ledgerSourceTitle(entry({ source: source({ kind: 'tool_result', source_file_id: null }) }))
		).toBe('tool_result');
	});
	it('falls back to source_kind when there is no source', () => {
		expect(ledgerSourceTitle(entry({ source: null, source_kind: 'unknown' }))).toBe('unknown');
	});
});
