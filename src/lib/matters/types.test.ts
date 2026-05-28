import { describe, it, expect } from 'vitest';
import { activeMatters, type Matter } from './types';

const m = (over: Partial<Matter> = {}): Matter =>
  ({ id: 'p1', name: 'Acme MSA', slug: 'acme-msa', description: null, context_md: null, owner_id: 'u1', privileged: false, attached_skill_names: [], attached_file_ids: [], is_sandbox: false, archived_at: null, created_at: '', updated_at: '', ...over }) as Matter;

describe('matters/types', () => {
  it('activeMatters drops sandbox projects', () => {
    const out = activeMatters([m({ id: 'a' }), m({ id: 'b', is_sandbox: true }), m({ id: 'c' })]);
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

});
