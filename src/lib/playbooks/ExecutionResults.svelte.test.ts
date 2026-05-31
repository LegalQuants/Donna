/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ExecutionResults from './ExecutionResults.svelte';
import type { ExecutionResults as Results, PositionResult } from './types';

const p = (verdict: PositionResult['verdict'], issue: string): PositionResult =>
  ({ issue, position_id: issue, severity_if_missing: 'high', verdict, confidence: 0.8, matched_text: 'x', matched_fallback_rank: null, justification: 'j', redline: null, cited_chunk_ids: [] });

const results: Results = {
  schema_version: 'm3-a2-v1',
  summary: { matches_standard: 1, matches_fallback: 0, deviates: 1, missing: 1 },
  positions: [p('matches_standard', 'Std One'), p('missing', 'Miss One'), p('deviates', 'Dev One')]
};

describe('ExecutionResults', () => {
  it('renders the scorecard and orders cards worst-first', () => {
    const { container } = render(ExecutionResults, { props: { results } });
    expect(screen.getByText('1 Missing')).toBeInTheDocument();
    const headings = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings).toEqual(['Miss One', 'Dev One', 'Std One']);
  });
});
