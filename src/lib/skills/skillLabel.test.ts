import { describe, it, expect } from 'vitest';
import { prettifySkillSlug } from './skillLabel';

describe('prettifySkillSlug', () => {
  it('title-cases a simple slug', () => {
    expect(prettifySkillSlug('comms-improver')).toBe('Comms Improver');
  });
  it('upper-cases known acronyms', () => {
    expect(prettifySkillSlug('contract-qa')).toBe('Contract QA');
    expect(prettifySkillSlug('nda-review')).toBe('NDA Review');
    expect(prettifySkillSlug('dpa-checklist-review')).toBe('DPA Checklist Review');
  });
  it('handles a multi-acronym slug with mixed-case display form', () => {
    expect(prettifySkillSlug('msa-review-saas')).toBe('MSA Review SaaS');
  });
  it('handles a single word with no hyphen', () => {
    expect(prettifySkillSlug('enhance')).toBe('Enhance');
  });
  it('returns empty string for empty input', () => {
    expect(prettifySkillSlug('')).toBe('');
  });
  it('collapses empty segments from stray dashes', () => {
    expect(prettifySkillSlug('nda--review-')).toBe('NDA Review');
  });
});
