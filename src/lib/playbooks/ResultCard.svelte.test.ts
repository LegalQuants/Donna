/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultCard from './ResultCard.svelte';
import type { PositionResult } from './types';

const base = (over: Partial<PositionResult> = {}): PositionResult => ({
  issue: 'Survival of Confidentiality',
  position_id: 'p1',
  severity_if_missing: 'high',
  verdict: 'deviates',
  confidence: 0.9,
  matched_text: 'survive for five (5) years',
  matched_fallback_rank: null,
  justification: 'Caps trade-secret survival.',
  redline: { old_text: 'five (5) years', new_text: 'so long as it remains a trade secret', justification: 'Align.' },
  cited_chunk_ids: [],
  ...over
});

describe('ResultCard', () => {
  it('shows issue, verdict, matched text and justification', () => {
    render(ResultCard, { props: { result: base() } });
    expect(screen.getByText('Survival of Confidentiality')).toBeInTheDocument();
    expect(screen.getByText('Deviates')).toBeInTheDocument();
    expect(screen.getByText(/survive for five \(5\) years/)).toBeInTheDocument();
    expect(screen.getByText(/Caps trade-secret survival/)).toBeInTheDocument();
  });
  it('shows the redline when present', () => {
    render(ResultCard, { props: { result: base() } });
    expect(screen.getByText(/so long as it remains a trade secret/)).toBeInTheDocument();
  });
  it('omits the redline block when redline is null', () => {
    render(ResultCard, { props: { result: base({ verdict: 'matches_standard', redline: null }) } });
    expect(screen.queryByText(/Suggested redline/i)).toBeNull();
  });
});
