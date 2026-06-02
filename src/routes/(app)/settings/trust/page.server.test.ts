// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const MODELS = {
  object: 'list',
  data: [
    { id: 'smart', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7' },
    { id: 'local', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama/llama3' }
  ]
};
const CFG = { allowed_tiers_global: [1, 2, 3, 4], default_minimum_tier: 1, privileged_minimum_tier: 4, warn_on_tiers: [] };

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const event = {} as never;

beforeEach(() => lqFetch.mockReset());

function route(map: Record<string, Response>) {
  lqFetch.mockImplementation((_e: unknown, path: string) => Promise.resolve(map[path] ?? new Response(null, { status: 500 })));
}

describe('trust page load', () => {
  it('returns matrix rows + tierConfig when both fetches succeed', async () => {
    route({ '/api/v1/models': ok(MODELS), '/api/v1/inference/tier-config': ok(CFG) });
    const r = await load(event);
    expect(r.rows.map((x) => [x.id, x.where])).toEqual([['smart', 'Cloud'], ['local', 'Local']]);
    expect(r.modelsError).toBe(false);
    expect(r.tierConfig).toEqual(CFG);
  });

  it('sets modelsError + empty rows when /models fails, still returns tierConfig', async () => {
    route({ '/api/v1/models': new Response(null, { status: 500 }), '/api/v1/inference/tier-config': ok(CFG) });
    const r = await load(event);
    expect(r.rows).toEqual([]);
    expect(r.modelsError).toBe(true);
    expect(r.tierConfig).toEqual(CFG);
  });

  it('returns tierConfig null when tier-config fails, still returns rows', async () => {
    route({ '/api/v1/models': ok(MODELS), '/api/v1/inference/tier-config': new Response(null, { status: 500 }) });
    const r = await load(event);
    expect(r.rows.length).toBe(2);
    expect(r.tierConfig).toBeNull();
  });
});
