import { describe, it, expect } from 'vitest';
import { toTrustRows } from './trust';
import type { ChatModelOption } from '$lib/models/types';

const local: ChatModelOption = { id: 'local', label: 'Llama 3', resolvedModel: 'ollama/llama3', group: 'local', tier: 1 };
const cloud: ChatModelOption = { id: 'smart', label: 'Opus 4.7', resolvedModel: 'anthropic-prod/claude-opus-4-7', group: 'cloud', tier: 4 };
const unlabeled: ChatModelOption = { id: 'mystery', label: '', resolvedModel: null, group: 'cloud', tier: null };

describe('toTrustRows', () => {
  it('maps a local model to a Local row that never leaves', () => {
    const [r] = toTrustRows([local]);
    expect(r).toEqual({ id: 'local', label: 'Llama 3', where: 'Local', tone: 'local', tier: 1, meaning: 'Never leaves your environment' });
  });

  it('maps a cloud model to a Cloud row that is anonymized', () => {
    const [r] = toTrustRows([cloud]);
    expect(r).toEqual({ id: 'smart', label: 'Opus 4.7', where: 'Cloud', tone: 'cloud', tier: 4, meaning: 'Anonymized before leaving' });
  });

  it('falls back to the id when the label is empty, and passes a null tier through', () => {
    const [r] = toTrustRows([unlabeled]);
    expect(r.label).toBe('mystery');
    expect(r.tier).toBeNull();
  });

  it('preserves order and length', () => {
    expect(toTrustRows([cloud, local]).map((r) => r.id)).toEqual(['smart', 'local']);
  });
});
