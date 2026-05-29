import { describe, it, expect } from 'vitest';
import { deriveSlug } from './deriveSlug';

describe('deriveSlug', () => {
  it('lowercases and hyphenates words', () => {
    expect(deriveSlug('Contract Review')).toBe('contract-review');
  });
  it('strips punctuation and collapses repeated separators', () => {
    expect(deriveSlug('NDA  —  v2!!')).toBe('nda-v2');
  });
  it('drops non-ascii characters', () => {
    expect(deriveSlug('Café Notes')).toBe('caf-notes');
  });
  it('trims leading and trailing dashes', () => {
    expect(deriveSlug('  -Hello-  ')).toBe('hello');
  });
  it('clamps to 32 chars without a trailing dash', () => {
    const out = deriveSlug('a'.repeat(40) + ' bbb');
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out.endsWith('-')).toBe(false);
  });
  it('returns empty string for input with no usable characters', () => {
    expect(deriveSlug('   ***   ')).toBe('');
  });
});
