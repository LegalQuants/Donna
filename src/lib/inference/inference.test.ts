import { describe, it, expect } from 'vitest';
import { availableTargets, orderedChatCategories, categoryFromEntry, categoryFromOption, reassignPatchBody, localModels } from './inference';
import type { AdminAliasEntry, ModelTarget } from './types';
import type { RawModelEntry, ChatModelOption } from '$lib/models/types';

const raw: RawModelEntry[] = [
  { id: 'smart', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7', routed_inference_tier: 4 },
  { id: 'local', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'ollama-local/llama3.1:8b', routed_inference_tier: 1 },
  { id: 'embedding', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/text-embedding', routed_inference_tier: 4 },
  { id: 'anthropic-prod/claude-opus-4-7', object: 'model', owned_by: 'anthropic-prod', lq_ai_kind: 'provider_native', provider_type: 'anthropic', routed_inference_tier: 4 },
  { id: 'ollama-local/llama3.1:8b', object: 'model', owned_by: 'ollama-local', lq_ai_kind: 'provider_native', provider_type: 'ollama', routed_inference_tier: 1 }
] as never;

describe('availableTargets', () => {
  it('maps provider-native entries to {provider, model} split on the owned_by prefix, grouped', () => {
    const t = availableTargets(raw);
    expect(t).toEqual([
      { id: 'anthropic-prod/claude-opus-4-7', provider: 'anthropic-prod', model: 'claude-opus-4-7', label: 'Opus 4.7', group: 'cloud', tier: 4 },
      { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 }
    ]);
  });
});

describe('orderedChatCategories', () => {
  it('returns chat-alias options in canonical order, excluding embedding/non-chat', () => {
    expect(orderedChatCategories(raw).map((o) => o.id)).toEqual(['smart', 'local']);
  });
});

describe('categoryFromEntry / categoryFromOption', () => {
  it('builds a CategoryView from an admin alias entry (currentTargetId = provider/model)', () => {
    const entry: AdminAliasEntry = { name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [], primary_inference_tier: 4 };
    expect(categoryFromEntry(entry)).toEqual({ name: 'smart', backingLabel: 'Opus 4.7', currentTargetId: 'anthropic-prod/claude-opus-4-7', tier: 4, group: 'cloud' });
  });
  it('builds a CategoryView from a normalized chat option', () => {
    const o: ChatModelOption = { id: 'local', label: 'llama3.1:8b', resolvedModel: 'ollama-local/llama3.1:8b', group: 'local', tier: 1 };
    expect(categoryFromOption(o)).toEqual({ name: 'local', backingLabel: 'llama3.1:8b', currentTargetId: 'ollama-local/llama3.1:8b', tier: 1, group: 'local' });
  });
});

describe('reassignPatchBody', () => {
  it('swaps the primary provider/model but PRESERVES the existing fallback', () => {
    const entry: AdminAliasEntry = { name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] };
    const target: ModelTarget = { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 };
    expect(reassignPatchBody(entry, target)).toEqual({ provider: 'ollama-local', model: 'llama3.1:8b', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] });
  });
});

describe('localModels', () => {
  it('is the local subset of availableTargets', () => {
    expect(localModels(raw).map((t) => t.id)).toEqual(['ollama-local/llama3.1:8b']);
  });
});
