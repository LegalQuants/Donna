// Defensively-parsed view model for the autonomous memory review queue
// (GET /api/v1/autonomous/memory). Mirrors the parsing style of findings.ts:
// drop malformed rows, never throw; `state`/`category` kept as plain strings
// so unknown values render neutrally.

export const MEMORY_STATES = ['proposed', 'kept', 'dismissed'] as const;
export type MemoryState = (typeof MEMORY_STATES)[number];

export interface MemoryEntry {
	id: string;
	state: string;
	category: string;
	content: string;
	source_session_id: string | null;
	created_at: string | null;
}

export interface MemoryList {
	entries: MemoryEntry[];
	total: number;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseMemoryList(raw: unknown): MemoryList {
	const r = obj(raw);
	const arr = Array.isArray(r.entries) ? r.entries : [];
	const entries = arr
		.map((e): MemoryEntry | null => {
			const m = obj(e);
			const id = str(m.id);
			const state = str(m.state);
			const category = str(m.category);
			const content = str(m.content);
			if (!id || !state || !category || content === null) return null;
			return {
				id,
				state,
				category,
				content,
				source_session_id: str(m.source_session_id),
				created_at: str(m.created_at)
			};
		})
		.filter((m): m is MemoryEntry => m !== null);
	return { entries, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}
