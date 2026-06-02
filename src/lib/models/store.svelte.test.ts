import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModelStore } from './store.svelte';

const ok = (data: unknown) => new Response(JSON.stringify({ object: 'list', data }), { status: 200 });
const ALIASES = [
  { id: 'smart', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7' },
  { id: 'fast', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-sonnet-4-6' }
];

beforeEach(() => localStorage.clear());

describe('createModelStore', () => {
  it('defaults to smart when nothing is stored', () => {
    expect(createModelStore().selectedModel).toBe('smart');
  });

  it('initializes from localStorage', () => {
    localStorage.setItem('donna.model', 'fast');
    expect(createModelStore().selectedModel).toBe('fast');
  });

  it('setModel updates state and persists', () => {
    const s = createModelStore();
    s.setModel('budget');
    expect(s.selectedModel).toBe('budget');
    expect(localStorage.getItem('donna.model')).toBe('budget');
  });

  it('load() populates normalized options', async () => {
    const s = createModelStore();
    await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
    expect(s.options.map((o) => o.id)).toEqual(['smart', 'fast']);
    expect(s.error).toBe(false);
  });

  it('load() falls back to a static smart option on error', async () => {
    const s = createModelStore();
    await s.load(vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    expect(s.error).toBe(true);
    expect(s.options.map((o) => o.id)).toEqual(['smart']);
  });

  it('resets selection to smart when the stored model is no longer offered', async () => {
    localStorage.setItem('donna.model', 'gone');
    const s = createModelStore();
    expect(s.selectedModel).toBe('gone');
    await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
    expect(s.selectedModel).toBe('smart');
  });

  it('selectedOption is null before options load', () => {
    expect(createModelStore().selectedOption).toBe(null);
  });

  it('selectedOption resolves to the option matching selectedModel after load', async () => {
    const s = createModelStore();
    await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
    expect(s.selectedModel).toBe('smart');
    expect(s.selectedOption?.id).toBe('smart');
    expect(s.selectedOption).toEqual(s.options.find((o) => o.id === 'smart'));
  });
});
