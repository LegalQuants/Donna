// src/lib/fiduciary/ledger.ts
// Defensive view model for GET /api/v1/chats/{id}/ledger and the identical
// autonomous-session ledger. The response is shape-typed in backend.d.ts but the
// runtime returns dict[str,Any] and `entry.source` is opaque/polymorphic — so we
// hand-parse here (house style of research.ts / findings.ts), dropping malformed
// rows rather than throwing. Treatment (Slice 2) is not parsed here beyond treatment_id.

export interface LedgerPassage {
	text: string;
	offset_start: number | null;
	offset_end: number | null;
	page: number | null;
	verified: boolean | null;
	method: string | null;
}
export interface LedgerSource {
	kind: string;
	source_file_id: string | null;
	opinion_id: number | null;
	cluster_id: number | null;
	external_ref: string | null;
	provider: string | null;
	label: string | null;
	subtitle: string | null;
	url: string | null;
	tool: string | null;
	passages: LedgerPassage[];
}
export interface LedgerEntry {
	id: string;
	message_id: string | null;
	source_kind: string;
	verification_status: string;
	confidence: number | null;
	provider: string | null;
	retrieved_at: string | null;
	treatment_id: string | null;
	created_at: string | null;
	source: LedgerSource | null;
}
export interface LedgerGate {
	message_id: string | null;
	gate_status: string;
	pass_count: number;
	supported_count: number;
	fail_count: number;
	total_assertions: number;
	confidence: number | null;
	created_at: string | null;
}
export interface Ledger {
	entries: LedgerEntry[];
	gates: LedgerGate[];
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function bool(v: unknown): boolean | null {
	return typeof v === 'boolean' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parsePassage(raw: unknown): LedgerPassage {
	const r = obj(raw);
	return {
		text: str(r.text) ?? '',
		offset_start: num(r.offset_start),
		offset_end: num(r.offset_end),
		page: num(r.page),
		verified: bool(r.verified),
		method: str(r.method)
	};
}

function parseSource(raw: unknown): LedgerSource | null {
	const r = obj(raw);
	const kind = str(r.kind);
	if (!kind) return null;
	const passages = Array.isArray(r.passages) ? r.passages.map(parsePassage) : [];
	return {
		kind,
		source_file_id: str(r.source_file_id),
		opinion_id: num(r.opinion_id),
		cluster_id: num(r.cluster_id),
		external_ref: str(r.external_ref),
		provider: str(r.provider),
		label: str(r.label),
		subtitle: str(r.subtitle),
		url: str(r.url),
		tool: str(r.tool),
		passages
	};
}

function parseEntry(raw: unknown): LedgerEntry | null {
	const r = obj(raw);
	const id = str(r.id);
	if (!id) return null;
	return {
		id,
		message_id: str(r.message_id),
		source_kind: str(r.source_kind) ?? 'unknown',
		verification_status: str(r.verification_status) ?? 'unverified',
		confidence: num(r.confidence),
		provider: str(r.provider),
		retrieved_at: str(r.retrieved_at),
		treatment_id: str(r.treatment_id),
		created_at: str(r.created_at),
		source: parseSource(r.source)
	};
}

function parseGate(raw: unknown): LedgerGate | null {
	const r = obj(raw);
	const gate_status = str(r.gate_status);
	if (!gate_status) return null;
	return {
		message_id: str(r.message_id),
		gate_status,
		pass_count: num(r.pass_count) ?? 0,
		supported_count: num(r.supported_count) ?? 0,
		fail_count: num(r.fail_count) ?? 0,
		total_assertions: num(r.total_assertions) ?? 0,
		confidence: num(r.confidence),
		created_at: str(r.created_at)
	};
}

export function parseLedger(raw: unknown): Ledger {
	const r = obj(raw);
	const entries = (Array.isArray(r.entries) ? r.entries : [])
		.map(parseEntry)
		.filter((e): e is LedgerEntry => e !== null);
	const gates = (Array.isArray(r.gates) ? r.gates : [])
		.map(parseGate)
		.filter((g): g is LedgerGate => g !== null);
	return { entries, gates };
}

export function entriesForMessage(ledger: Ledger, messageId: string): LedgerEntry[] {
	return ledger.entries.filter((e) => e.message_id === messageId);
}
export function gateForMessage(ledger: Ledger, messageId: string): LedgerGate | null {
	return ledger.gates.find((g) => g.message_id === messageId) ?? null;
}
