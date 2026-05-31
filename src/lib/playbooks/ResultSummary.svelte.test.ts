/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultSummary from './ResultSummary.svelte';

describe('ResultSummary', () => {
  it('renders a chip per verdict with its count', () => {
    render(ResultSummary, { props: { summary: { matches_standard: 5, matches_fallback: 2, deviates: 1, missing: 0 } } });
    expect(screen.getByText('5 Standard')).toBeInTheDocument();
    expect(screen.getByText('2 Fallback')).toBeInTheDocument();
    expect(screen.getByText('1 Deviates')).toBeInTheDocument();
    expect(screen.getByText('0 Missing')).toBeInTheDocument();
  });
});
