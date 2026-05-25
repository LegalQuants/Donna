import { describe, it, expect } from 'vitest';
import { citeState, tooltipFor, type Citation } from './types';

const base = (over: Partial<Citation> = {}): Citation => ({
  id: 'c', source_file_id: 'f', source_text: 'x', partial: false, verified: true,
  verification_method: 'exact_match', verification_confidence: 1, ...over
});

describe('citeState', () => {
  it('exact_match / tolerant_match verified → green', () => {
    expect(citeState(base({ verification_method: 'exact_match' }))).toBe('verified');
    expect(citeState(base({ verification_method: 'tolerant_match' }))).toBe('verified');
  });
  it('judge / ensemble methods → caveats (yellow)', () => {
    expect(citeState(base({ verification_method: 'paraphrase_judge' }))).toBe('caveats');
    expect(citeState(base({ verification_method: 'ensemble_majority' }))).toBe('caveats');
  });
  it('partial → caveats even if method is green', () => {
    expect(citeState(base({ verification_method: 'exact_match', partial: true }))).toBe('caveats');
  });
  it('not verified or missing → unverified', () => {
    expect(citeState(base({ verified: false }))).toBe('unverified');
    expect(citeState(undefined)).toBe('unverified');
  });
  it('verified with unknown method → green (defensive)', () => {
    expect(citeState(base({ verification_method: undefined }))).toBe('verified');
  });
});

describe('tooltipFor', () => {
  it('labels by method with confidence', () => {
    expect(tooltipFor(base({ verification_method: 'exact_match', verification_confidence: 1 })))
      .toBe('Verified — exact match in source (100%)');
  });
  it('paraphrase partial appends caveat', () => {
    expect(tooltipFor(base({ verification_method: 'paraphrase_judge', partial: true, verification_confidence: 0.7 })))
      .toContain('source partially supports');
  });
  it('unverified label', () => {
    expect(tooltipFor(base({ verified: false }))).toMatch(/could not confirm/i);
  });
});
