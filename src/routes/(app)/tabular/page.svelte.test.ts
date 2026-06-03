import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { TabularExecutionSummary } from '$lib/tabular/types';

const summary: TabularExecutionSummary = {
  id: 'ex-1', status: 'completed', document_count: 3, column_count: 2,
  cost_estimate_usd: '0.12', created_at: '2026-05-01T10:00:00Z'
};

describe('/tabular history page', () => {
  it('shows the empty state and a New review link when there are no executions', () => {
    render(Page, { props: { data: { executions: [] } } as never });
    expect(screen.getByText(/no tabular reviews yet/i)).toBeInTheDocument();
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/tabular/new');
    expect(link).toBeTruthy();
  });

  it('renders a row per execution', () => {
    render(Page, { props: { data: { executions: [summary] } } as never });
    expect(screen.getByText(/3 docs · 2 cols/i)).toBeInTheDocument();
  });
});
