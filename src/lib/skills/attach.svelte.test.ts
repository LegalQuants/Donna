import { describe, it, expect, vi } from 'vitest';
import { createSkillAttach } from './attach.svelte';
import type { SkillSuggestion } from './types';

const ok = (results: unknown) => new Response(JSON.stringify({ results }), { status: 200 });
const NDA: SkillSuggestion = { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: 'Full NDA review', scope: 'builtin', icon: null };
const NDA2: SkillSuggestion = { slug: 'nda-snapshot', slash_alias: null, title: 'NDA Snapshot', description: 'Quick snapshot', scope: 'builtin', icon: null };

const inputsRes = (required: unknown[], optional: unknown[] = []) =>
  new Response(JSON.stringify({ name: 's', required, optional }), { status: 200 });

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

  it('attach adds slug+title, dedupes by slug, fetches inputs, and drives names', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([], []));
    await s.attach(NDA, f);
    await s.attach(NDA, f); // dedupe → no second add
    await s.attach(NDA2, f);
    expect(s.attached.map((a) => ({ slug: a.slug, title: a.title }))).toEqual([
      { slug: 'nda-review', title: 'NDA Review' },
      { slug: 'nda-snapshot', title: 'NDA Snapshot' }
    ]);
    expect(s.names).toEqual(['nda-review', 'nda-snapshot']);
    expect(f.mock.calls[0][0]).toBe('/skills/nda-review/inputs');
  });

  it('remove drops by slug', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([]));
    await s.attach(NDA, f);
    await s.attach(NDA2, f);
    s.remove('nda-review');
    expect(s.names).toEqual(['nda-snapshot']);
  });

  it('attach exposes required/optional and seeds values from defaults', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(inputsRes(
      [{ name: 'jurisdiction', type: 'enum', required: true, enum: ['DE', 'NY'], default: 'DE' }],
      [{ name: 'notes', type: 'text', required: false }]
    ));
    await s.attach(NDA, f);
    const e = s.attached[0];
    expect(e.required.map((d) => d.name)).toEqual(['jurisdiction']);
    expect(e.optional.map((d) => d.name)).toEqual(['notes']);
    expect(e.values).toEqual({ jurisdiction: 'DE' });
  });

  it('allRequiredFilled flips as required values are set', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(inputsRes([{ name: 'party', type: 'text', required: true }]));
    await s.attach(NDA, f);
    expect(s.allRequiredFilled).toBe(false);
    s.setInputValue('nda-review', 'party', 'Acme');
    expect(s.allRequiredFilled).toBe(true);
  });

  it('skillInputs is keyed by slug, coerced, and omits empty optionals + valueless skills', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(inputsRes(
      [{ name: 'party', type: 'text', required: true }],
      [{ name: 'count', type: 'integer', required: false }]
    ));
    await s.attach(NDA, f);
    s.setInputValue('nda-review', 'party', 'Acme');
    s.setInputValue('nda-review', 'count', 3);
    const f2 = vi.fn().mockResolvedValue(inputsRes([], [{ name: 'x', type: 'text', required: false }]));
    await s.attach(NDA2, f2);
    expect(s.skillInputs).toEqual({ 'nda-review': { party: 'Acme', count: 3 } });
  });

  it('inputs fetch failure sets inputsError and does not block allRequiredFilled', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
    await s.attach(NDA, f);
    expect(s.attached[0].inputsError).toBe(true);
    expect(s.allRequiredFilled).toBe(true);
  });

  it('attach does not error inputs when reused across skills', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([]));
    await s.attach(NDA, f);
    await s.attach(NDA2, f);
    expect(s.attached.every((a) => a.inputsError === false)).toBe(true);
  });

  it('treats a required boolean (false) and integer (0) as provided, but whitespace as not', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([
      { name: 'redline', type: 'boolean', required: true },
      { name: 'count', type: 'integer', required: true },
      { name: 'party', type: 'text', required: true }
    ]));
    await s.attach(NDA, f);
    // boolean seeds false (provided), integer + text unset → not yet filled
    expect(s.allRequiredFilled).toBe(false);
    s.setInputValue('nda-review', 'count', 0);   // 0 is provided
    s.setInputValue('nda-review', 'party', '   '); // whitespace is NOT provided
    expect(s.allRequiredFilled).toBe(false);
    s.setInputValue('nda-review', 'party', 'Acme');
    expect(s.allRequiredFilled).toBe(true);
    // boolean false is provided and survives into skillInputs; whitespace-cleared values are omitted
    expect(s.skillInputs).toEqual({ 'nda-review': { redline: false, count: 0, party: 'Acme' } });
  });

  it('setInputValue(undefined) removes a previously-set value', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([], [{ name: 'notes', type: 'text', required: false }]));
    await s.attach(NDA, f);
    s.setInputValue('nda-review', 'notes', 'hi');
    expect(s.skillInputs).toEqual({ 'nda-review': { notes: 'hi' } });
    s.setInputValue('nda-review', 'notes', undefined);
    expect(s.skillInputs).toEqual({});
  });

  it('does not let a required file-type input block sending (file inputs are not rendered)', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockImplementation(() => inputsRes([{ name: 'doc', type: 'file', required: true }]));
    await s.attach(NDA, f);
    expect(s.allRequiredFilled).toBe(true);
  });

  it('blocks sending while a skill is still loading its inputs', () => {
    const s = createSkillAttach();
    let resolveFetch: (r: Response) => void = () => {};
    const f = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    const pending = s.attach(NDA, f); // do NOT await yet
    expect(s.allRequiredFilled).toBe(false); // inputsLoading === true → blocked
    resolveFetch(inputsRes([]));
    return pending.then(() => {
      expect(s.allRequiredFilled).toBe(true); // loaded, no required → unblocked
    });
  });
});
