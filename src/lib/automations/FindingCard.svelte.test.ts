/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FindingCard from './FindingCard.svelte';
import type { FindingItem } from './findings';

const f = (over: Partial<FindingItem> = {}): FindingItem => ({
  id: 'f1', severity: 'critical', title: 'Missing indemnity cap', content: 'Line 1\nLine 2', created_at: '2026-06-05T10:00:00Z', ...over
});

describe('FindingCard', () => {
  it('renders badge, title, multi-line content, and timestamp', () => {
    render(FindingCard, { props: { finding: f() } });
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('Missing indemnity cap')).toBeInTheDocument();
    // whitespace-pre-wrap content keeps the newline in one node
    expect(screen.getByText(/Line 1\s+Line 2/)).toBeInTheDocument();
  });
  it('shows an unknown severity verbatim (lowercased, truncated) as a neutral badge', () => {
    render(FindingCard, { props: { finding: f({ severity: 'Needs-Partner-Review-Immediately-Long' }) } });
    expect(screen.getByText('needs-partner-review-imm')).toBeInTheDocument(); // 24 chars, ellipsis-free cut
  });
  it('falls back to "note" for an empty severity', () => {
    render(FindingCard, { props: { finding: f({ severity: '' }) } });
    expect(screen.getByText('note')).toBeInTheDocument();
  });
});
