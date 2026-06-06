/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RunResults from './RunResults.svelte';
import type { FindingItem, RunMemoryItem } from './findings';

const f = (id: string, severity: string, title: string): FindingItem =>
  ({ id, severity, title, content: 'body', created_at: '2026-06-05T10:00:00Z' });
const m = (id: string, state: string): RunMemoryItem =>
  ({ id, state, category: 'preference', content: 'Likes brevity', created_at: '2026-06-05T10:01:00Z' });
const base = { findings: [] as FindingItem[] | null, findingsTotal: 0 as number | null, memories: [] as RunMemoryItem[] | null, running: false };

describe('RunResults', () => {
  it('renders findings in emission order with a severity summary', () => {
    render(RunResults, { props: { ...base, findings: [f('f1', 'info', 'First emitted'), f('f2', 'critical', 'Second emitted')], findingsTotal: 2 } });
    expect(screen.getByText('1 critical · 1 info')).toBeInTheDocument();
    const titles = screen.getAllByText(/emitted$/).map((el) => el.textContent);
    expect(titles).toEqual(['First emitted', 'Second emitted']); // ASC emission order — NOT severity-grouped
  });
  it('shows the overflow note when total exceeds the fetched page', () => {
    render(RunResults, { props: { ...base, findings: [f('f1', 'info', 'Only one shown')], findingsTotal: 250 } });
    expect(screen.getByText('+249 more findings not shown.')).toBeInTheDocument();
  });
  it('terminal + zero findings → recorded-none empty state', () => {
    render(RunResults, { props: { ...base } });
    expect(screen.getByText('This run recorded no findings.')).toBeInTheDocument();
  });
  it('running + zero findings → "No findings yet." and running sub-copy', () => {
    render(RunResults, { props: { ...base, running: true } });
    expect(screen.getByText('No findings yet.')).toBeInTheDocument();
    expect(screen.getByText(/still working/)).toBeInTheDocument();
  });
  it('null findings → unavailable message', () => {
    render(RunResults, { props: { ...base, findings: null, findingsTotal: null } });
    expect(screen.getByText('Results unavailable right now.')).toBeInTheDocument();
  });
  it('renders the memories sub-section with state chips only when non-empty', () => {
    const { rerender } = render(RunResults, { props: { ...base, memories: [m('m1', 'proposed'), m('m2', 'kept')] } });
    expect(screen.getByText('Memories this run proposed')).toBeInTheDocument();
    expect(screen.getByText('proposed')).toBeInTheDocument();
    expect(screen.getByText('kept')).toBeInTheDocument();
    rerender({ ...base, memories: [] });
    expect(screen.queryByText('Memories this run proposed')).toBeNull();
  });
  it('hides the memories sub-section when memories is null (fetch failed)', () => {
    render(RunResults, { props: { ...base, memories: null } });
    expect(screen.queryByText('Memories this run proposed')).toBeNull();
  });
});
