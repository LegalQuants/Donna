// src/lib/automations/runNow.test.ts
import { describe, it, expect } from 'vitest';
import { toPlaybookItems, toSkillItems } from './runNow';

describe('toPlaybookItems', () => {
  it('maps playbooks to {value:id,label:name,sub:contract_type}', () => {
    const items = toPlaybookItems([{ id: 'p1', name: 'NDA — Mutual', contract_type: 'NDA' }]);
    expect(items).toEqual([{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }]);
  });
  it('returns [] for a non-array', () => {
    expect(toPlaybookItems(null as never)).toEqual([]);
  });
});

describe('toSkillItems', () => {
  it('merges user skills (slug) and built-ins (name) into source items', () => {
    const items = toSkillItems(
      [{ slug: 'my-skill', display_name: 'My Skill', description: 'mine' }],
      [{ name: 'comms-improver', title: 'Comms Improver', description: 'builtin' }]
    );
    expect(items).toEqual([
      { value: 'my-skill', label: 'My Skill', sub: 'mine' },
      { value: 'comms-improver', label: 'Comms Improver', sub: 'builtin' }
    ]);
  });
  it('tolerates missing arrays', () => {
    expect(toSkillItems(undefined as never, undefined as never)).toEqual([]);
  });
});
