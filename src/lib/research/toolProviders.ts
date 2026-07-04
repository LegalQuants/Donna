// src/lib/research/toolProviders.ts
// Hand-typed view model + helpers for GET /api/v1/admin/tool-providers
// (lq-ai #273). The routes are not in Donna's generated typegen (they live in
// the code-generated OpenAPI export, which we don't yet consume — see the pin
// log), so we hand-type + defensively parse here (house style of
// $lib/inference/providerKeys.ts). Secrets are never returned — rows carry
// only a has_key bool.

export interface ToolProviderRow {
	type: string;
	enabled: boolean;
	name: string | null;
	has_key: boolean;
	key_required: boolean;
	egress_tier: number | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseToolProviders(raw: unknown): ToolProviderRow[] {
	const arr = obj(raw).tool_providers;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((p) => {
			const r = obj(p);
			if (typeof r.type !== 'string') return null;
			return {
				type: r.type,
				enabled: r.enabled === true,
				name: str(r.name),
				has_key: r.has_key === true,
				key_required: r.key_required === true,
				egress_tier: num(r.egress_tier)
			};
		})
		.filter((p): p is ToolProviderRow => p !== null);
}

const LABELS: Record<string, string> = {
	courtlistener: 'CourtListener — U.S. case law',
	govinfo: 'GovInfo — U.S. Code + CFR',
	edgar: 'SEC EDGAR — company filings',
	eurlex: 'EUR-Lex — EU law + CJEU'
};

/** Human label for a source type; falls back to the raw type. */
export function sourceLabel(type: string): string {
	return LABELS[type] ?? type;
}

/** The key-column state for a row. */
export function keyStatus(row: ToolProviderRow): 'no_key_needed' | 'key_set' | 'no_key' {
	if (!row.key_required) return 'no_key_needed';
	return row.has_key ? 'key_set' : 'no_key';
}
