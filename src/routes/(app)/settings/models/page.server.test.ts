// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const modelsBody = {
  object: 'list',
  data: [
    { id: 'smart', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7', routed_inference_tier: 4 },
    { id: 'anthropic-prod/claude-opus-4-7', object: 'model', owned_by: 'anthropic-prod', lq_ai_kind: 'provider_native', provider_type: 'anthropic', routed_inference_tier: 4 },
    { id: 'ollama-local/llama3.1:8b', object: 'model', owned_by: 'ollama-local', lq_ai_kind: 'provider_native', provider_type: 'ollama', routed_inference_tier: 1 }
  ]
};
const ev = (isAdmin: boolean) => ({ locals: { user: { is_admin: isAdmin } } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/settings/models load', () => {
  it('admin: fetches models + admin aliases, builds categories from the alias entries', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: 'list', data: [{ name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [], primary_inference_tier: 4 }] }), { status: 200 }));
    const out = (await load(ev(true))) as { isAdmin: boolean; categories: { name: string; currentTargetId: string | null }[]; targets: unknown[]; localModels: unknown[]; modelsError: boolean };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/models');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/admin/aliases');
    expect(out.isAdmin).toBe(true);
    expect(out.categories[0]).toMatchObject({ name: 'smart', currentTargetId: 'anthropic-prod/claude-opus-4-7' });
    expect(out.targets).toHaveLength(2);
    expect(out.localModels).toHaveLength(1);
    expect(out.modelsError).toBe(false);
  });

  it('non-admin: skips the admin call and derives categories from /models', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
    const out = (await load(ev(false))) as { isAdmin: boolean; categories: { name: string }[] };
    expect(lqFetch).toHaveBeenCalledTimes(1);
    expect(out.isAdmin).toBe(false);
    expect(out.categories[0].name).toBe('smart');
  });

  it('flags modelsError when /models fails', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const out = (await load(ev(false))) as { modelsError: boolean; categories: unknown[] };
    expect(out.modelsError).toBe(true);
    expect(out.categories).toEqual([]);
  });

  it('admin: when /admin/aliases fails, categories fall back to the /models-derived backings', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const out = (await load(ev(true))) as { modelsError: boolean; categories: { name: string; currentTargetId: string | null }[] };
    expect(out.modelsError).toBe(false);
    expect(out.categories[0]).toMatchObject({ name: 'smart', currentTargetId: 'anthropic-prod/claude-opus-4-7' });
  });
});
