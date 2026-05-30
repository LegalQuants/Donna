/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SeverityBadge from './SeverityBadge.svelte';

describe('SeverityBadge', () => {
  it('renders the Critical label with the error token', () => {
    render(SeverityBadge, { props: { severity: 'critical' } });
    const el = screen.getByText('Critical');
    expect(el).toBeInTheDocument();
    expect(el.className).toMatch(/bg-mlq-error/);
  });
  it('renders High with the amber caveats token', () => {
    render(SeverityBadge, { props: { severity: 'high' } });
    expect(screen.getByText('High').className).toMatch(/bg-mlq-caveats/);
  });
  it('renders Medium with the muted token', () => {
    render(SeverityBadge, { props: { severity: 'medium' } });
    expect(screen.getByText('Medium').className).toMatch(/bg-mlq-muted/);
  });
  it('renders Low as an outline (no fill)', () => {
    render(SeverityBadge, { props: { severity: 'low' } });
    const el = screen.getByText('Low');
    expect(el.className).toMatch(/border/);
    expect(el.className).not.toMatch(/bg-mlq-(error|caveats|muted)/);
  });
});
