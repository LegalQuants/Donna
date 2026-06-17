// src/lib/research/research.ts
// Typed view-models + defensive parsers for the /api/v1/research surface
// (legal-research WS3, pin e2cc311). The backend types these shapes, but the
// OpenAPI entries are INLINE (not named components/schemas), so we hand-declare
// matching interfaces here and guard at the boundary — same style as
// automations/findings.ts. Parsers drop malformed rows rather than throw.

export type OpinionTextField =
	| 'html_with_citations'
	| 'html_columbia'
	| 'html_lawbox'
	| 'xml_harvard'
	| 'html_anon_2020'
	| 'html'
	| 'plain_text';

export interface ResearchProvider {
	name: string;
	type: string;
}
export interface ResearchCapabilities {
	enabled: boolean;
	providers: ResearchProvider[];
}

export interface SearchResultItem {
	cluster_id: number | null;
	case_name: string | null;
	court: string | null;
	date_filed: string | null;
	citation: string | null;
	absolute_url: string | null;
	snippet: string | null;
}
export interface SearchResponse {
	count: number | null;
	nextCursor: string | null;
	results: SearchResultItem[];
}

export interface ClusterMeta {
	cluster_id: number;
	case_name: string | null;
	court: string | null;
	date_filed: string | null;
	absolute_url: string | null;
}
export interface OpinionMeta {
	opinion_id: number;
	text_field_used: OpinionTextField | null;
	char_length: number;
}
export interface ClusterView {
	cluster: ClusterMeta;
	opinions: OpinionMeta[];
}

export interface FindMatch {
	position: number;
	snippet: string;
}

export interface CitationCluster {
	id: number | null;
	case_name: string | null;
	absolute_url: string | null;
}
export interface VerifiedCitation {
	citation: string | null;
	normalized_citations: string[];
	status: number | null;
	error_message: string | null;
	clusters: CitationCluster[];
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

export function parseCapabilities(raw: unknown): ResearchCapabilities {
	const r = obj(raw);
	const enabled = r.enabled === true;
	const providers = (Array.isArray(r.providers) ? r.providers : [])
		.map((p) => {
			const o = obj(p);
			const name = str(o.name);
			const type = str(o.type);
			return name && type ? { name, type } : null;
		})
		.filter((p): p is ResearchProvider => p !== null);
	return { enabled, providers };
}

function parseSearchItem(raw: unknown): SearchResultItem | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	return {
		cluster_id: num(r.cluster_id),
		case_name: str(r.case_name),
		court: str(r.court),
		date_filed: str(r.date_filed),
		citation:
			typeof r.citation === 'string'
				? r.citation
				: str((obj(r.citation) as { cite?: unknown }).cite),
		absolute_url: str(r.absolute_url),
		snippet: str(r.snippet)
	};
}

export function parseSearchResponse(raw: unknown): SearchResponse {
	const r = obj(raw);
	const results = (Array.isArray(r.results) ? r.results : [])
		.map(parseSearchItem)
		.filter((x): x is SearchResultItem => x !== null);
	return { count: num(r.count), nextCursor: str(r.next_cursor), results };
}

export function parseClusterView(raw: unknown): ClusterView | null {
	const r = obj(raw);
	const c = obj(r.cluster);
	if (typeof c.cluster_id !== 'number') return null;
	const opinions = (Array.isArray(r.opinions) ? r.opinions : [])
		.map((o) => {
			const oo = obj(o);
			if (typeof oo.opinion_id !== 'number') return null;
			return {
				opinion_id: oo.opinion_id,
				text_field_used: str(oo.text_field_used) as OpinionTextField | null,
				char_length: num(oo.char_length) ?? 0
			};
		})
		.filter((o): o is OpinionMeta => o !== null);
	return {
		cluster: {
			cluster_id: c.cluster_id,
			case_name: str(c.case_name),
			court: str(c.court),
			date_filed: str(c.date_filed),
			absolute_url: str(c.absolute_url)
		},
		opinions
	};
}

export function parseFindMatches(raw: unknown): FindMatch[] {
	const r = obj(raw);
	return (Array.isArray(r.matches) ? r.matches : [])
		.map((m) => {
			const o = obj(m);
			return typeof o.position === 'number'
				? { position: o.position, snippet: str(o.snippet) ?? '' }
				: null;
		})
		.filter((m): m is FindMatch => m !== null);
}

export function parseCitations(raw: unknown): VerifiedCitation[] {
	const r = obj(raw);
	return (Array.isArray(r.citations) ? r.citations : [])
		.map((c) => {
			if (!c || typeof c !== 'object') return null;
			const o = c as Record<string, unknown>;
			const clusters = (Array.isArray(o.clusters) ? o.clusters : []).map((cl) => {
				const x = obj(cl);
				return { id: num(x.id), case_name: str(x.case_name), absolute_url: str(x.absolute_url) };
			});
			return {
				citation: str(o.citation),
				normalized_citations: strArray(o.normalized_citations),
				status: num(o.status),
				error_message: str(o.error_message),
				clusters
			};
		})
		.filter((c): c is VerifiedCitation => c !== null);
}

const TEXT_FIELD_LABELS: Record<OpinionTextField, string> = {
	plain_text: 'Plain text',
	html_with_citations: 'HTML-derived',
	html_columbia: 'HTML-derived',
	html_lawbox: 'HTML-derived',
	html_anon_2020: 'HTML-derived',
	html: 'HTML-derived',
	xml_harvard: 'XML-derived (Harvard)'
};

/** Honest, friendly label for the opinion's source text field. Empty when unknown. */
export function textFieldLabel(v: OpinionTextField | string | null | undefined): string {
	if (!v) return '';
	return TEXT_FIELD_LABELS[v as OpinionTextField] ?? '';
}
