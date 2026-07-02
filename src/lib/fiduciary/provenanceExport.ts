// src/lib/fiduciary/provenanceExport.ts
// Pure, DOM-free serializer that turns a fiduciary ledger (entries + gate) into
// an honest, self-describing provenance record: a curated JSON envelope and a
// human-readable / printable Markdown copy. Signed-export-ready (a future
// `signature` block drops into the envelope). The caller stamps `exported_at`
// so this module has no time dependency and stays deterministically testable.
import type { LedgerEntry, LedgerGate } from './ledger';
import { gateVerdict, entryVerification, isProvenance } from './trust';

export const PROVENANCE_DISCLAIMER =
	'A faithful copy of the sourcing trail — not a cryptographically signed attestation.';

export type ProvenanceSource =
	| { type: 'chat_turn'; chat_id: string; message_id: string }
	| { type: 'autonomous_session'; session_id: string };

export interface ProvenanceMeta {
	source: ProvenanceSource;
	exported_at: string; // ISO-8601, stamped by the caller
}

export interface ProvenanceExport {
	json: string;
	markdown: string;
	baseFilename: string;
}

// Extracted verbatim from FiduciaryReceipt.svelte so the JSON, the Markdown, and
// the on-screen receipt name a polymorphic source identically.
export function ledgerSourceTitle(e: LedgerEntry): string {
	const s = e.source;
	if (!s) return e.source_kind;
	if (s.label) return s.label;
	if (s.kind === 'kb_document') return 'Knowledge-base document';
	if (s.kind === 'caselaw') return s.opinion_id ? `Opinion #${s.opinion_id}` : 'Case law';
	if (s.external_ref) return s.external_ref;
	return s.kind;
}

function sourceLine(s: ProvenanceSource): string {
	return s.type === 'chat_turn'
		? `Chat turn ${s.message_id} of chat ${s.chat_id}`
		: `Autonomous session ${s.session_id}`;
}

function verdictLine(gate: LedgerGate | null): string {
	const v = gateVerdict(gate);
	if (!v || !gate) return 'No fiduciary gate recorded.';
	const n = gate.total_assertions;
	return `${v.label}${n > 0 ? ` — ${n} assertion${n === 1 ? '' : 's'}` : ''}`;
}

function entryBlock(e: LedgerEntry): string {
	const chip = entryVerification(e.verification_status);
	const conf = e.confidence !== null ? ` · ${Math.round(e.confidence * 100)}%` : '';
	const lines = [`- **${ledgerSourceTitle(e)}** — ${chip.label}${conf}`];
	for (const p of e.source?.passages ?? []) lines.push(`  > "${p.text}"`);
	if (e.source?.kind === 'caselaw' && e.treatment) {
		const t = e.treatment;
		lines.push(
			`  - ⚖ Cited by ${t.cited_by_count ?? '—'} · derived${t.strongest_negative_class ? ` · strongest signal: ${t.strongest_negative_class}` : ''}`
		);
		for (const sig of t.signals)
			lines.push(
				`    - ${sig.classification}${sig.justification ? ` — ${sig.justification}` : ''}`
			);
	}
	return lines.join('\n');
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

export function buildProvenanceExport(
	entries: LedgerEntry[],
	gate: LedgerGate | null,
	meta: ProvenanceMeta
): ProvenanceExport {
	const envelope = {
		kind: 'provenance_record',
		version: 1,
		disclaimer: PROVENANCE_DISCLAIMER,
		source: meta.source,
		exported_at: meta.exported_at,
		gate,
		entries
	};
	const json = JSON.stringify(envelope, null, 2);

	const quoted = entries.filter((e) => !isProvenance(e.verification_status));
	const consulted = entries.filter((e) => isProvenance(e.verification_status));
	const md: string[] = [
		'# Provenance record',
		'',
		`> ${PROVENANCE_DISCLAIMER}`,
		'',
		`**Source:** ${sourceLine(meta.source)}`,
		`**Exported:** ${meta.exported_at}`,
		'',
		`**Verdict:** ${verdictLine(gate)}`,
		''
	];
	if (quoted.length > 0) {
		md.push('## Sources cited', '');
		for (const e of quoted) md.push(entryBlock(e), '');
	}
	if (consulted.length > 0) {
		md.push('## Consulted, not quoted', '');
		for (const e of consulted)
			md.push(
				`- ${e.source?.label ?? ledgerSourceTitle(e)}${e.source?.subtitle ? ` — ${e.source.subtitle}` : ''}`,
				''
			);
	}
	const markdown = md.join('\n');

	const kind = meta.source.type === 'autonomous_session' ? 'session' : 'chat';
	const id =
		meta.source.type === 'autonomous_session' ? meta.source.session_id : meta.source.message_id;
	const baseFilename = `provenance-${kind}-${shortId(id)}-${meta.exported_at.slice(0, 10)}`;

	return { json, markdown, baseFilename };
}
