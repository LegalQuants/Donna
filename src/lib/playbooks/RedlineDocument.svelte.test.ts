/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineDocument from './RedlineDocument.svelte';
import type { ExecutionResults as Results, PositionResult, Redline } from './types';

const change = (issue: string, severity: PositionResult['severity_if_missing'], redline: Redline | null): PositionResult => ({
  issue, position_id: issue, severity_if_missing: severity, verdict: 'deviates', confidence: 1,
  matched_text: null, matched_fallback_rank: null, justification: 'verdict-j', redline, cited_chunk_ids: []
});

const wrap = (positions: PositionResult[]): Results => ({
  schema_version: 'm3-a2-v1',
  summary: { matches_standard: 0, matches_fallback: 0, deviates: positions.length, missing: 0 },
  positions
});

describe('RedlineDocument', () => {
  it('renders one change per redline position, severity-ordered, filtering null redlines', () => {
    const results = wrap([
      change('Low Issue', 'low', { old_text: 'a', new_text: 'b', justification: 'jl' }),
      change('No Redline', 'critical', null),
      change('Crit Issue', 'critical', { old_text: 'c', new_text: 'd', justification: 'jc' })
    ]);
    render(RedlineDocument, { props: { results } });
    expect(screen.queryByText('No Redline')).not.toBeInTheDocument();
    const issues = screen.getAllByText(/Issue$/).map((e) => e.textContent);
    expect(issues).toEqual(['Crit Issue', 'Low Issue']);
  });

  it('shows the issue, severity badge, and the redline justification in the margin note', () => {
    const results = wrap([change('Term', 'high', { old_text: 'x', new_text: 'y', justification: 'because reasons' })]);
    render(RedlineDocument, { props: { results } });
    expect(screen.getByText('Term')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('because reasons')).toBeInTheDocument();
    expect(screen.queryByText('verdict-j')).not.toBeInTheDocument();
  });

  it('renders a pure insertion (empty old_text) with no struck text', () => {
    const results = wrap([change('Add', 'medium', { old_text: '', new_text: 'New clause', justification: 'j' })]);
    const { container } = render(RedlineDocument, { props: { results } });
    expect(screen.getByText('New clause')).toBeInTheDocument();
    expect(container.querySelector('.line-through')).toBeNull();
  });

  it('shows an empty state when no position has a redline', () => {
    const results = wrap([change('A', 'high', null), change('B', 'low', null)]);
    render(RedlineDocument, { props: { results } });
    expect(screen.getByText(/No redlines/i)).toBeInTheDocument();
  });
});
