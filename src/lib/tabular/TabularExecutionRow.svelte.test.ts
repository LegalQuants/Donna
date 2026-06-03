import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TabularExecutionRow from './TabularExecutionRow.svelte';
import type { TabularExecutionSummary } from './types';

const summary: TabularExecutionSummary = {
  id: 'ex-1',
  status: 'completed',
  document_count: 3,
  column_count: 2,
  cost_estimate_usd: '0.12',
  created_at: '2026-05-01T10:00:00Z'
};

describe('TabularExecutionRow', () => {
  it('links to the run page and shows status, counts and estimate', () => {
    render(TabularExecutionRow, { props: { summary } as never });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/tabular/ex-1');
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/3 docs · 2 cols/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
  });

  it('handles singular counts and a missing estimate', () => {
    render(TabularExecutionRow, {
      props: { summary: { ...summary, document_count: 1, column_count: 1, cost_estimate_usd: null } } as never
    });
    expect(screen.getByText(/1 doc · 1 col/i)).toBeInTheDocument();
  });
});
