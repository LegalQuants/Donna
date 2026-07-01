// src/lib/research/sources.ts
// Defensively-parsed view model for GET /api/v1/research/sources (the research
// source registry — which authoritative legal sources this instance can reach).
// The endpoint is typed (SourcesResponse), but we guard at the boundary in the
// house style of research.ts: drop malformed rows rather than throw.

export interface ResearchSource {
	name: string | null;
	type: string;
	jurisdiction: string | null;
	coverage: string | null;
	content_kinds: string[];
	enabled: boolean;
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
function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseSources(raw: unknown): ResearchSource[] {
	const arr = obj(raw).sources;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((s) => {
			const r = obj(s);
			if (typeof r.type !== 'string') return null;
			return {
				name: str(r.name),
				type: r.type,
				jurisdiction: str(r.jurisdiction),
				coverage: str(r.coverage),
				content_kinds: strArray(r.content_kinds),
				enabled: r.enabled === true,
				egress_tier: num(r.egress_tier)
			};
		})
		.filter((s): s is ResearchSource => s !== null);
}

/** Human title for a source row: the operator-given name, else the provider type. */
export function sourceTitle(s: ResearchSource): string {
	return s.name ?? s.type;
}
