import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createMatterSkillAttach } from './createMatterSkillAttach.svelte';

describe('createMatterSkillAttach', () => {
  it('open() fetches /skills/autocomplete with empty q and exposes results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ slug: 'r1', title: 'Redline', scope: 'builtin' }] }), { status: 200 }));
    const c = createMatterSkillAttach({ onattach: vi.fn() });
    await c.open(fetchFn);
    flushSync();
    expect(fetchFn).toHaveBeenCalledWith('/skills/autocomplete?q=&limit=8');
    expect(c.results.map((r) => r.slug)).toEqual(['r1']);
    expect(c.loading).toBe(false);
    expect(c.error).toBe(false);
  });

  it('search(q) fetches with the encoded q', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const c = createMatterSkillAttach({ onattach: vi.fn() });
    await c.search('contract redline', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/skills/autocomplete?q=contract%20redline&limit=8');
  });

  it('sets error: true and empties results on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }));
    const c = createMatterSkillAttach({ onattach: vi.fn() });
    await c.open(fetchFn);
    flushSync();
    expect(c.error).toBe(true);
    expect(c.results).toEqual([]);
  });

  it('attach(s) calls the onattach callback with the slug', () => {
    const onattach = vi.fn();
    const c = createMatterSkillAttach({ onattach });
    c.attach({ slug: 'redline', title: 'Redline', scope: 'builtin' });
    expect(onattach).toHaveBeenCalledWith('redline');
  });
});
