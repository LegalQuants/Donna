// src/lib/inference/providerKeys.test.ts
import { describe, it, expect } from 'vitest';
import { parseProviderKeys, sourceLabel, canRevoke, type ProviderKeyRow } from './providerKeys';

const raw = (over: Record<string, unknown> = {}) => ({
  provider: 'anthropic-prod', type: 'anthropic', configured: true, last4: 'a1b2', source: 'env', ...over
});

describe('parseProviderKeys', () => {
  it('parses the provider_keys envelope', () => {
    const out = parseProviderKeys({ provider_keys: [raw(), raw({ provider: 'openai-prod', source: 'runtime' })] });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ provider: 'anthropic-prod', type: 'anthropic', configured: true, last4: 'a1b2', source: 'env' });
    expect(out[1].source).toBe('runtime');
  });
  it('drops malformed rows and tolerates missing fields', () => {
    const out = parseProviderKeys({ provider_keys: [{ nope: 1 }, raw({ type: null, configured: 'yes', last4: null, source: 'weird' })] });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ provider: 'anthropic-prod', type: null, configured: false, last4: null, source: null });
  });
  it('returns [] for a non-object / missing envelope', () => {
    expect(parseProviderKeys(null)).toEqual([]);
    expect(parseProviderKeys({ keys: [] })).toEqual([]);
  });
});

describe('sourceLabel / canRevoke', () => {
  const row = (source: ProviderKeyRow['source']): ProviderKeyRow =>
    ({ provider: 'p', type: null, configured: source !== null, last4: null, source });
  it('labels the three sources', () => {
    expect(sourceLabel(row('runtime'))).toBe('runtime');
    expect(sourceLabel(row('env'))).toBe('environment');
    expect(sourceLabel(row(null))).toBe('no key');
  });
  it('only runtime rows are revocable', () => {
    expect(canRevoke(row('runtime'))).toBe(true);
    expect(canRevoke(row('env'))).toBe(false);
    expect(canRevoke(row(null))).toBe(false);
  });
});
