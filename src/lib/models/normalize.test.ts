import { describe, it, expect } from 'vitest';
import { toChatOptions, prettifyModel } from './normalize';
import type { RawModelEntry } from './types';

// Trimmed capture of the live /models response (2026-05-25 spike). `created`/`owned_by`
// are required by the generated ModelEntry contract (lq-ai #105).
const A = { object: 'model', created: 0, owned_by: 'lq-ai-gateway' } as const;
const N = { object: 'model', created: 0 } as const;
const RAW: RawModelEntry[] = [
  { ...A, id: 'smart', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7' },
  { ...A, id: 'fast', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-sonnet-4-6' },
  { ...A, id: 'budget', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-haiku-4-5' },
  { ...A, id: 'local', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:9b' },
  { ...A, id: 'local-fast', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:4b-nvfp4' },
  { ...A, id: 'local-thinking', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:9b' },
  { ...A, id: 'embedding', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'openai-prod/text-embedding-3-small' },
  { ...N, id: 'anthropic-prod/claude-opus-4-7', owned_by: 'anthropic-prod', lq_ai_kind: 'provider_native', routed_inference_tier: 4, provider_type: 'anthropic' },
  { ...N, id: 'openai-prod/whisper-1', owned_by: 'openai-prod', lq_ai_kind: 'provider_native', routed_inference_tier: 4, provider_type: 'openai' }
];

describe('toChatOptions', () => {
  it('keeps only the 6 chat aliases (drops embedding + provider_native)', () => {
    const ids = toChatOptions(RAW).map((o) => o.id);
    expect(ids).toEqual(['smart', 'fast', 'budget', 'local', 'local-fast', 'local-thinking']);
  });

  it('groups cloud vs local (ollama / tier-1 → local)', () => {
    const byId = Object.fromEntries(toChatOptions(RAW).map((o) => [o.id, o.group]));
    expect(byId.smart).toBe('cloud');
    expect(byId.fast).toBe('cloud');
    expect(byId.budget).toBe('cloud');
    expect(byId.local).toBe('local');
    expect(byId['local-fast']).toBe('local');
    expect(byId['local-thinking']).toBe('local'); // both heuristics apply (ollama prefix AND tier 1)
  });

  it('carries tier and resolved model through', () => {
    const smart = toChatOptions(RAW).find((o) => o.id === 'smart')!;
    expect(smart).toMatchObject({ tier: 4, resolvedModel: 'anthropic-prod/claude-opus-4-7', label: 'Opus 4.7' });
  });
});

describe('prettifyModel', () => {
  it('formats the Claude family', () => {
    expect(prettifyModel('anthropic-prod/claude-opus-4-7')).toBe('Opus 4.7');
    expect(prettifyModel('anthropic-prod/claude-sonnet-4-6')).toBe('Sonnet 4.6');
    expect(prettifyModel('anthropic-prod/claude-haiku-4-5')).toBe('Haiku 4.5');
  });

  it('falls back to the tail for non-Claude models', () => {
    expect(prettifyModel('ollama-local/qwen3.5:9b')).toBe('qwen3.5:9b');
  });

  it('returns empty string for null/empty', () => {
    expect(prettifyModel(null)).toBe('');
    expect(prettifyModel('')).toBe('');
  });
});
