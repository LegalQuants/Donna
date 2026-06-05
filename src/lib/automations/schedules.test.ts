// src/lib/automations/schedules.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchedule, parseScheduleList, sourceLabel, buildScheduleBody } from './schedules';
import type { SourceItem } from './runNow';

const raw = {
  id: 's1', name: 'Weekly summary', cron_expr: '0 9 * * 1',
  playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: 'm1',
  max_cost_usd: '2.50', enabled: true, next_run_at: '2026-06-08T09:00:00Z', last_run_at: null
};

describe('parseSchedule / parseScheduleList', () => {
  it('parses a well-formed schedule', () => {
    const s = parseSchedule(raw);
    expect(s).not.toBeNull();
    expect(s!.id).toBe('s1');
    expect(s!.enabled).toBe(true);
    expect(s!.max_cost_usd).toBe('2.50');
    expect(s!.next_run_at).toBe('2026-06-08T09:00:00Z');
  });
  it('returns null when id or cron_expr is missing', () => {
    expect(parseSchedule({ id: 's1' })).toBeNull();
    expect(parseSchedule({ cron_expr: '0 9 * * *' })).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });
  it('reads the {schedules:[...]} envelope and a bare array', () => {
    expect(parseScheduleList({ schedules: [raw] })).toHaveLength(1);
    expect(parseScheduleList([raw, { bad: true }])).toHaveLength(1);
    expect(parseScheduleList({})).toEqual([]);
  });
});

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA Review' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver' }];

describe('sourceLabel', () => {
  it('resolves a playbook id to its label', () => {
    expect(sourceLabel(parseSchedule(raw)!, playbookItems, skillItems)).toBe('NDA Review');
  });
  it('resolves a skill ref to its label, falling back to the ref', () => {
    const s = parseSchedule({ ...raw, playbook_id: null, skill_ref: 'comms' })!;
    expect(sourceLabel(s, playbookItems, skillItems)).toBe('Comms Improver');
    const s2 = parseSchedule({ ...raw, playbook_id: null, skill_ref: 'unknown' })!;
    expect(sourceLabel(s2, playbookItems, skillItems)).toBe('unknown');
  });
  it('returns an em-dash when neither a playbook nor a skill is set', () => {
    const s = parseSchedule({ ...raw, playbook_id: null, skill_ref: null })!;
    expect(sourceLabel(s, playbookItems, skillItems)).toBe('—');
  });
});

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('buildScheduleBody', () => {
  it('builds a playbook body with cron + optional fields', () => {
    const out = buildScheduleBody(fd({
      source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *',
      name: 'Daily', target_kb_id: 'kb1', project_id: 'm1', max_cost_usd: '2.00', enabled: 'true'
    }));
    expect(out.ok).toBe(true);
    expect(out.ok && out.body).toEqual({
      cron_expr: '0 9 * * *', enabled: true, playbook_id: 'p1',
      name: 'Daily', target_kb_id: 'kb1', project_id: 'm1', max_cost_usd: '2.00'
    });
  });
  it('builds a skill body and honors enabled=false', () => {
    const out = buildScheduleBody(fd({ source_mode: 'skill', skill_ref: 'comms', cron_expr: '0 9 * * *', enabled: 'false' }));
    expect(out.ok && out.body).toEqual({ cron_expr: '0 9 * * *', enabled: false, skill_ref: 'comms' });
  });
  it('fails when the source or cron is missing', () => {
    expect(buildScheduleBody(fd({ source_mode: 'playbook', cron_expr: '0 9 * * *' })).ok).toBe(false);
    expect(buildScheduleBody(fd({ source_mode: 'playbook', playbook_id: 'p1' })).ok).toBe(false);
  });
  it('drops a non-numeric or negative max_cost_usd', () => {
    const out = buildScheduleBody(fd({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *', max_cost_usd: 'abc' }));
    expect(out.ok).toBe(true);
    expect(out.ok && 'max_cost_usd' in out.body).toBe(false);
  });
  it('keeps a valid max_cost_usd in the body', () => {
    const out = buildScheduleBody(fd({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *', max_cost_usd: '1.50' }));
    expect(out.ok && out.body.max_cost_usd).toBe('1.50');
  });
});
