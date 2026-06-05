import { describe, it, expect } from 'vitest';
import { sourceLabel } from './sourceLabel';
import type { SourceItem } from './runNow';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA Review' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver' }];

describe('sourceLabel', () => {
  it('resolves a playbook id to its label (fallback "Playbook")', () => {
    expect(sourceLabel({ playbook_id: 'p1', skill_ref: null }, playbookItems, skillItems)).toBe('NDA Review');
    expect(sourceLabel({ playbook_id: 'gone', skill_ref: null }, playbookItems, skillItems)).toBe('Playbook');
  });
  it('resolves a skill ref to its label, falling back to the ref', () => {
    expect(sourceLabel({ playbook_id: null, skill_ref: 'comms' }, playbookItems, skillItems)).toBe('Comms Improver');
    expect(sourceLabel({ playbook_id: null, skill_ref: 'unknown' }, playbookItems, skillItems)).toBe('unknown');
  });
  it('returns an em-dash when neither is set', () => {
    expect(sourceLabel({ playbook_id: null, skill_ref: null }, playbookItems, skillItems)).toBe('—');
  });
});
