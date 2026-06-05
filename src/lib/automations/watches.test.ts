import { describe, it, expect } from 'vitest';
import { parseWatch, parseWatchList, buildWatchBody, kbLabel } from './watches';
import type { KnowledgeBase } from '$lib/knowledge/types';

const raw = {
  id: 'w1', knowledge_base_id: 'kb1', playbook_id: 'p1', skill_ref: null,
  project_id: 'm1', max_cost_usd: '2.50', enabled: true
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

const kb = (id: string, name: string): KnowledgeBase => ({ id, name, owner_id: 'u1', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });

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
    const out = buildWatchBody(fd({
      source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kb1',
      project_id: 'm1', max_cost_usd: '2.00', enabled: 'true'
    }), 'create');
    expect(out.ok).toBe(true);
    expect(out.ok && out.body).toEqual({
      enabled: true, playbook_id: 'p1', knowledge_base_id: 'kb1', project_id: 'm1', max_cost_usd: '2.00'
    });
  });
  it('create: fails without a knowledge_base_id', () => {
    expect(buildWatchBody(fd({ source_mode: 'playbook', playbook_id: 'p1' }), 'create').ok).toBe(false);
  });
  it('create: fails without a source', () => {
    expect(buildWatchBody(fd({ source_mode: 'playbook', knowledge_base_id: 'kb1' }), 'create').ok).toBe(false);
  });
  it('update: omits knowledge_base_id and project_id (immutable), keeps source/enabled/cost', () => {
    const out = buildWatchBody(fd({
      source_mode: 'skill', skill_ref: 'comms', knowledge_base_id: 'kb1',
      project_id: 'm1', max_cost_usd: '1.50', enabled: 'false'
    }), 'update');
    expect(out.ok && out.body).toEqual({ enabled: false, skill_ref: 'comms', max_cost_usd: '1.50' });
  });
  it('drops a non-numeric max_cost_usd', () => {
    const out = buildWatchBody(fd({ source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kb1', max_cost_usd: 'abc' }), 'create');
    expect(out.ok).toBe(true);
    expect(out.ok && 'max_cost_usd' in out.body).toBe(false);
  });
});
