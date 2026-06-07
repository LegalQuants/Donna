// Defensively-parsed view models for the Review page's Precedents + Proposals
// sections (GET /api/v1/autonomous/{precedents,project-context-proposals}).
// Mirrors memory.ts: drop malformed rows, never throw; free-text fields render
// neutrally downstream.

export interface PrecedentEntry {
	id: string;
	pattern_kind: string;
	summary: string;
	observed_count: number;
	source_session_id: string | null;
	created_at: string | null;
}

export interface PrecedentList {
	entries: PrecedentEntry[];
	total: number;
}

export interface ProposalEntry {
	id: string;
	precedent_id: string;
	project_id: string;
	suggested_md: string;
	state: string;
	created_at: string | null;
}

export interface ProposalList {
	proposals: ProposalEntry[];
	total: number;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parsePrecedentList(raw: unknown): PrecedentList {
	const r = obj(raw);
	const arr = Array.isArray(r.entries) ? r.entries : [];
	const entries = arr
		.map((e): PrecedentEntry | null => {
			const p = obj(e);
			const id = str(p.id);
			const pattern_kind = str(p.pattern_kind);
			const summary = str(p.summary);
			if (!id || !pattern_kind || summary === null) return null;
			return {
				id,
				pattern_kind,
				summary,
				observed_count: typeof p.observed_count === 'number' ? p.observed_count : 1,
				source_session_id: str(p.source_session_id),
				created_at: str(p.created_at)
			};
		})
		.filter((p): p is PrecedentEntry => p !== null);
	return { entries, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}

export function parseProposalList(raw: unknown): ProposalList {
	const r = obj(raw);
	const arr = Array.isArray(r.proposals) ? r.proposals : [];
	const proposals = arr
		.map((e): ProposalEntry | null => {
			const p = obj(e);
			const id = str(p.id);
			const precedent_id = str(p.precedent_id);
			const project_id = str(p.project_id);
			const suggested_md = str(p.suggested_md);
			const state = str(p.state);
			if (!id || !precedent_id || !project_id || suggested_md === null || !state) return null;
			return { id, precedent_id, project_id, suggested_md, state, created_at: str(p.created_at) };
		})
		.filter((p): p is ProposalEntry => p !== null);
	return { proposals, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}
