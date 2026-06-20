// Defensively-parsed external-source provenance (lq-ai PR6c). The
// /messages/{id}/sources endpoint returns rows with every field optional
// (source_kind='caselaw' in 6c), so we hand-parse — mirroring findings.ts.
// Retrieval-provenance ("sources consulted"), distinct from verified-quote
// citations; rendered as a per-message panel, never claim-level grounded.

export interface ToolSource {
	id: string;
	message_id: string;
	source_kind: string;
	label: string;
	subtitle: string | null;
	url: string | null;
	external_ref: string | null;
	provider: string;
	tool: string;
	created_at: string | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseToolSource(raw: unknown): ToolSource | null {
	const r = obj(raw);
	const label = str(r.label);
	if (label === null) return null; // label is the load-bearing field
	return {
		id: str(r.id) ?? '',
		message_id: str(r.message_id) ?? '',
		source_kind: str(r.source_kind) ?? '',
		label,
		subtitle: str(r.subtitle),
		url: str(r.url),
		external_ref: str(r.external_ref),
		provider: str(r.provider) ?? '',
		tool: str(r.tool) ?? '',
		created_at: str(r.created_at)
	};
}

/** Parse the raw /sources array; drops malformed/label-less rows, preserves
 *  retrieval order. Non-array input → []. */
export function parseToolSources(raw: unknown): ToolSource[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(parseToolSource).filter((s): s is ToolSource => s !== null);
}
