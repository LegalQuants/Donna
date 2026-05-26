import { describe, it, expect, vi } from 'vitest';
import { createSkillAttach } from './attach.svelte';
import type { SkillSuggestion } from './types';

const ok = (results: unknown) => new Response(JSON.stringify({ results }), { status: 200 });
const NDA: SkillSuggestion = { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: 'Full NDA review', scope: 'builtin', icon: null };
const NDA2: SkillSuggestion = { slug: 'nda-snapshot', slash_alias: null, title: 'NDA Snapshot', description: 'Quick snapshot', scope: 'builtin', icon: null };

describe('createSkillAttach', () => {
  it('starts empty', () => {
    const s = createSkillAttach();
    expect(s.attached).toEqual([]);
    expect(s.names).toEqual([]);
  });

  it('open() fetches recents (empty q) into results', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(ok([NDA, NDA2]));
    await s.open(f);
    expect(f.mock.calls[0][0]).toBe('/skills/autocomplete?q=&limit=8');
    expect(s.results.map((r) => r.slug)).toEqual(['nda-review', 'nda-snapshot']);
    expect(s.error).toBe(false);
  });

  it('search(q) fetches ranked matches', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(ok([NDA]));
    await s.search('nda', f);
    expect(f.mock.calls[0][0]).toBe('/skills/autocomplete?q=nda&limit=8');
    expect(s.results.map((r) => r.slug)).toEqual(['nda-review']);
  });

  it('search error sets error and clears results', async () => {
    const s = createSkillAttach();
    await s.search('x', vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    expect(s.error).toBe(true);
    expect(s.results).toEqual([]);
  });

  it('attach adds {slug,title}, dedupes by slug, and drives names', () => {
    const s = createSkillAttach();
    s.attach(NDA);
    s.attach(NDA); // dedupe
    s.attach(NDA2);
    expect(s.attached).toEqual([
      { slug: 'nda-review', title: 'NDA Review' },
      { slug: 'nda-snapshot', title: 'NDA Snapshot' }
    ]);
    expect(s.names).toEqual(['nda-review', 'nda-snapshot']);
  });

  it('remove drops by slug', () => {
    const s = createSkillAttach();
    s.attach(NDA);
    s.attach(NDA2);
    s.remove('nda-review');
    expect(s.names).toEqual(['nda-snapshot']);
  });
});
