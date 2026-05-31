import { describe, it, expect } from 'vitest';
import { VERDICTS, verdictMeta, compareByVerdict } from './verdict';
import type { PositionResult } from './types';

const pr = (verdict: PositionResult['verdict']): PositionResult =>
  ({ verdict } as PositionResult);

describe('verdict helpers', () => {
  it('orders verdicts worst-first', () => {
    expect(VERDICTS).toEqual(['missing', 'deviates', 'matches_fallback', 'matches_standard']);
  });
  it('maps each verdict to a label and a badge class', () => {
    expect(verdictMeta('matches_standard').label).toBe('Standard');
    expect(verdictMeta('matches_fallback').label).toBe('Fallback');
    expect(verdictMeta('deviates').label).toBe('Deviates');
    expect(verdictMeta('missing').label).toBe('Missing');
    expect(verdictMeta('missing').badgeClass).toMatch(/mlq-error/);
  });
  it('sorts position results worst-first via compareByVerdict', () => {
    const sorted = [pr('matches_standard'), pr('missing'), pr('matches_fallback'), pr('deviates')].sort(compareByVerdict);
    expect(sorted.map((p) => p.verdict)).toEqual(['missing', 'deviates', 'matches_fallback', 'matches_standard']);
  });
});
