import { describe, it, expect } from 'vitest';
import { parseWatch, parseWatchList, buildWatchBody, kbLabel } from './watches';
import type { KnowledgeBase } from '$lib/knowledge/types';

const raw = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: 'm1',
	max_cost_usd: '2.50',
	enabled: true
};

describe('parseWatch / parseWatchList', () => {
	it('parses a well-formed watch', () => {
		const w = parseWatch(raw);
		expect(w).not.toBeNull();
		expect(w!.id).toBe('w1');
		expect(w!.knowledge_base_id).toBe('kb1');
		expect(w!.enabled).toBe(true);
		expect(w!.max_cost_usd).toBe('2.50');
	});
	it('returns null when id or knowledge_base_id is missing', () => {
		expect(parseWatch({ id: 'w1' })).toBeNull();
		expect(parseWatch({ knowledge_base_id: 'kb1' })).toBeNull();
		expect(parseWatch(null)).toBeNull();
	});
	it('reads the {watches:[...]} envelope and a bare array', () => {
		expect(parseWatchList({ watches: [raw] })).toHaveLength(1);
		expect(parseWatchList([raw, { bad: true }])).toHaveLength(1);
		expect(parseWatchList({})).toEqual([]);
	});
});

const kb = (id: string, name: string): KnowledgeBase => ({
	id,
	name,
	owner_id: 'u1',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
});

describe('kbLabel', () => {
	it('resolves the watched KB name, falling back when absent', () => {
		expect(kbLabel(parseWatch(raw)!, [kb('kb1', 'Contracts KB')])).toBe('Contracts KB');
		expect(kbLabel(parseWatch(raw)!, [])).toBe('a knowledge base');
	});
});

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('buildWatchBody', () => {
	it('create: requires source + knowledge_base_id, emits project_id', () => {
		const out = buildWatchBody(
			fd({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				project_id: 'm1',
				max_cost_usd: '2.00',
				enabled: 'true'
			}),
			'create'
		);
		expect(out.ok).toBe(true);
		expect(out.ok && out.body).toEqual({
			enabled: true,
			emit_artifacts: false,
			playbook_id: 'p1',
			knowledge_base_id: 'kb1',
			project_id: 'm1',
			max_cost_usd: '2.00'
		});
	});
	it('create: fails without a knowledge_base_id', () => {
		expect(buildWatchBody(fd({ source_mode: 'playbook', playbook_id: 'p1' }), 'create').ok).toBe(
			false
		);
	});
	it('create: fails without a source', () => {
		expect(
			buildWatchBody(fd({ source_mode: 'playbook', knowledge_base_id: 'kb1' }), 'create').ok
		).toBe(false);
	});
	it('update: omits knowledge_base_id (immutable) but emits project_id, keeps source/enabled/cost', () => {
		const out = buildWatchBody(
			fd({
				source_mode: 'skill',
				skill_ref: 'comms',
				knowledge_base_id: 'kb1',
				project_id: 'm1',
				max_cost_usd: '1.50',
				enabled: 'false'
			}),
			'update'
		);
		expect(out.ok && out.body).toEqual({
			enabled: false,
			emit_artifacts: false,
			skill_ref: 'comms',
			project_id: 'm1',
			max_cost_usd: '1.50'
		});
	});
	it('update: maps an empty project_id to null (unassign)', () => {
		const out = buildWatchBody(
			fd({ source_mode: 'playbook', playbook_id: 'p1', project_id: '' }),
			'update'
		);
		expect(out.ok).toBe(true);
		expect(out.ok && out.body.project_id).toBeNull();
	});
	it('update: an absent project_id field also maps to null', () => {
		const out = buildWatchBody(fd({ source_mode: 'playbook', playbook_id: 'p1' }), 'update');
		expect(out.ok && out.body.project_id).toBeNull();
	});
	it('create: still omits an empty project_id', () => {
		const out = buildWatchBody(
			fd({ source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kb1', project_id: '' }),
			'create'
		);
		expect(out.ok && 'project_id' in out.body).toBe(false);
	});
	it('drops a non-numeric max_cost_usd', () => {
		const out = buildWatchBody(
			fd({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				max_cost_usd: 'abc'
			}),
			'create'
		);
		expect(out.ok).toBe(true);
		expect(out.ok && 'max_cost_usd' in out.body).toBe(false);
	});
	it('create: emit_artifacts defaults false and follows the checkbox', () => {
		const fd2 = new FormData();
		fd2.set('source_mode', 'playbook');
		fd2.set('playbook_id', 'p1');
		fd2.set('knowledge_base_id', 'kb1');
		const off = buildWatchBody(fd2, 'create');
		expect(off.ok && off.body.emit_artifacts).toBe(false);
		fd2.set('emit_artifacts', 'true');
		const on = buildWatchBody(fd2, 'create');
		expect(on.ok && on.body.emit_artifacts).toBe(true);
	});
	it('update: emit_artifacts is always an explicit boolean (false persists, never null)', () => {
		const fd2 = new FormData();
		fd2.set('source_mode', 'playbook');
		fd2.set('playbook_id', 'p1');
		fd2.set('emit_artifacts', 'false');
		const r = buildWatchBody(fd2, 'update');
		expect(r.ok && r.body.emit_artifacts).toBe(false);
	});
});
