import { describe, it, expect } from 'vitest';
import { trustPosture, PROVENANCE_OPTIONS, TRUST_OPTIONS } from './preferences';
import type { ChatModelOption } from '$lib/models/types';

const local: ChatModelOption = { id: 'local-fast', label: 'Llama 3', resolvedModel: 'ollama/llama3', group: 'local', tier: 1 };
const cloud: ChatModelOption = { id: 'smart', label: 'Opus 4.7', resolvedModel: 'anthropic-prod/claude-opus-4-7', group: 'cloud', tier: 4 };

describe('trustPosture', () => {
  it('marks a local model self-hosted (green tone, full label, model in detail)', () => {
    const p = trustPosture(local);
    expect(p.tone).toBe('local');
    expect(p.label).toBe('Self-hosted · Local');
    expect(p.detail).toMatch(/never leaves/i);
  });

  it('marks a cloud model cloud (amber tone, tier in label, model in detail)', () => {
    const p = trustPosture(cloud);
    expect(p.tone).toBe('cloud');
    expect(p.label).toBe('Cloud · Tier 4');
    expect(p.detail).toMatch(/Opus 4\.7/);
  });

  it('omits the tier from the cloud label when tier is null', () => {
    expect(trustPosture({ ...cloud, tier: null }).label).toBe('Cloud');
  });
});

describe('option lists', () => {
  it('expose the two values for each control', () => {
    expect(TRUST_OPTIONS.map((o) => o.value)).toEqual(['labels', 'dots']);
    expect(PROVENANCE_OPTIONS.map((o) => o.value)).toEqual(['always', 'collapsed']);
  });
});
