// src/lib/inference/providerKeys.ts
// Defensively-parsed view models + display helpers for the admin provider-key
// API (lq-ai /api/v1/admin/provider-keys, lq-ai #128). The backend never
// returns the full key — rows carry at most last4. Mirrors the parsing style
// of $lib/automations/types.ts.

export interface ProviderKeyRow {
	provider: string;
	type: string | null;
	configured: boolean;
	last4: string | null;
	source: 'env' | 'runtime' | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseProviderKeys(raw: unknown): ProviderKeyRow[] {
	const arr = obj(raw).provider_keys;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((p) => {
			const r = obj(p);
			if (typeof r.provider !== 'string') return null;
			return {
				provider: r.provider,
				type: str(r.type),
				configured: r.configured === true,
				last4: str(r.last4),
				source: r.source === 'env' || r.source === 'runtime' ? r.source : null
			};
		})
		.filter((p): p is ProviderKeyRow => p !== null);
}

/** Display label for where a row's key comes from. */
export function sourceLabel(row: ProviderKeyRow): string {
	return row.source === 'runtime' ? 'runtime' : row.source === 'env' ? 'environment' : 'no key';
}

/** Only runtime-managed keys can be revoked via the API (env rows 409). */
export function canRevoke(row: ProviderKeyRow): boolean {
	return row.source === 'runtime';
}
