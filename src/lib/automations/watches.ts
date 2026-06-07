// Defensively-parsed view models + form helpers for autonomous watches
// (lq-ai /api/v1/autonomous/watches). Mirrors schedules.ts. A watch is bound to
// a required, immutable knowledge_base_id; project_id is editable on update.
import type { KnowledgeBase } from '$lib/knowledge/types';

export interface WatchSummary {
	id: string;
	knowledge_base_id: string;
	playbook_id: string | null;
	skill_ref: string | null;
	project_id: string | null;
	max_cost_usd: string | null;
	enabled: boolean;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseWatch(raw: unknown): WatchSummary | null {
	const r = obj(raw);
	if (typeof r.id !== 'string' || typeof r.knowledge_base_id !== 'string') return null;
	return {
		id: r.id,
		knowledge_base_id: r.knowledge_base_id,
		playbook_id: str(r.playbook_id),
		skill_ref: str(r.skill_ref),
		project_id: str(r.project_id),
		max_cost_usd: str(r.max_cost_usd),
		enabled: r.enabled === true
	};
}

export function parseWatchList(raw: unknown): WatchSummary[] {
	const envelope = obj(raw).watches;
	const arr = Array.isArray(raw) ? raw : Array.isArray(envelope) ? (envelope as unknown[]) : [];
	return arr.map(parseWatch).filter((w): w is WatchSummary => w !== null);
}

/** The watched KB's display name, resolved against the loaded KBs. */
export function kbLabel(w: WatchSummary, kbs: KnowledgeBase[]): string {
	return kbs.find((k) => k.id === w.knowledge_base_id)?.name ?? 'a knowledge base';
}

export type WatchBodyResult = { ok: true; body: Record<string, unknown> } | { ok: false };

/** Build the create/update request body. Create requires a source AND a
 *  knowledge_base_id (and may carry project_id). Update omits knowledge_base_id
 *  (immutable) but always sends project_id — a value reassigns the matter,
 *  explicit null unassigns (omit = unchanged, per AutonomousWatchUpdate's
 *  exclude_unset PATCH semantics). */
export function buildWatchBody(form: FormData, mode: 'create' | 'update'): WatchBodyResult {
	const srcMode = String(form.get('source_mode') ?? 'playbook');
	const playbookId = String(form.get('playbook_id') ?? '');
	const skillRef = String(form.get('skill_ref') ?? '');
	const kbId = String(form.get('knowledge_base_id') ?? '');
	const projectId = String(form.get('project_id') ?? '');
	const maxCost = String(form.get('max_cost_usd') ?? '').trim();
	const enabled = String(form.get('enabled') ?? 'true') === 'true';

	const sourceOk = srcMode === 'skill' ? Boolean(skillRef) : Boolean(playbookId);
	if (!sourceOk || (mode === 'create' && !kbId)) return { ok: false };

	const body: Record<string, unknown> = { enabled };
	if (srcMode === 'skill') body.skill_ref = skillRef;
	else body.playbook_id = playbookId;
	if (mode === 'create') {
		body.knowledge_base_id = kbId;
		if (projectId) body.project_id = projectId;
	} else {
		body.project_id = projectId || null;
	}
	if (maxCost && Number.isFinite(Number(maxCost)) && Number(maxCost) >= 0)
		body.max_cost_usd = maxCost;
	return { ok: true, body };
}
