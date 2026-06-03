import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TabularGrid from './TabularGrid.svelte';
import type { TabularResults } from './types';

const results: TabularResults = {
  schema_version: 'm3-c2-v1',
  rows: [
    {
      document_id: 'd1',
      document_name: 'a.pdf',
      cells: {
        'Governing law': { value: 'Delaware', cited_chunk_ids: ['c1', 'c2'], confidence: 'high', error: null },
        Term: { value: '', cited_chunk_ids: [], confidence: 'failed', error: 'no answer' }
      }
    }
  ],
  summary: { total_cells: 2, failed_cells: 1 }
};

describe('TabularGrid', () => {
  it('renders document rows, column headers and cell values', () => {
    render(TabularGrid, { props: { results, columns: ['Governing law', 'Term'], executionId: 'ex1' } as never });
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('Governing law')).toBeInTheDocument();
    expect(screen.getByText('Delaware')).toBeInTheDocument();
  });

  it('shows a citation count and a (failed) marker, plus the summary', () => {
    render(TabularGrid, { props: { results, columns: ['Governing law', 'Term'], executionId: 'ex1' } as never });
    expect(screen.getByText('2')).toBeInTheDocument(); // citation count for the Delaware cell
    expect(screen.getByText('(failed)')).toBeInTheDocument();
    expect(screen.getByText(/2 cells · 1 failed/i)).toBeInTheDocument();
  });
});
