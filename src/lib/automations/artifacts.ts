// src/lib/automations/artifacts.ts
// Defensively-parsed view models for a run's document-grade artifacts
// (lq-ai #138: GET /sessions/{id}/artifacts — references to real KB documents).
// Mirrors the parsing style of findings.ts. `file_id`/`document_id` are
// nullable: a hard file-delete SET-NULLs the refs (name/size survive);
// `document_id` is read-time-enriched upstream and drives "Open".

export interface ArtifactItem {
	id: string;
	name: string;
	mime: string;
	size_bytes: number;
	file_id: string | null;
	document_id: string | null;
	created_at: string | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseArtifact(raw: unknown): ArtifactItem | null {
	const r = obj(raw);
	if (typeof r.id !== 'string') return null;
	return {
		id: r.id,
		name: str(r.name) ?? '',
		mime: str(r.mime) ?? '',
		size_bytes: typeof r.size_bytes === 'number' ? r.size_bytes : 0,
		file_id: str(r.file_id),
		document_id: str(r.document_id),
		created_at: str(r.created_at)
	};
}

export interface ArtifactList {
	artifacts: ArtifactItem[];
	total: number;
}

export function parseArtifactList(raw: unknown): ArtifactList {
	const r = obj(raw);
	const arr = Array.isArray(r.artifacts) ? r.artifacts : [];
	const artifacts = arr.map(parseArtifact).filter((a): a is ArtifactItem => a !== null);
	const total = typeof r.total_count === 'number' ? r.total_count : artifacts.length;
	return { artifacts, total };
}
