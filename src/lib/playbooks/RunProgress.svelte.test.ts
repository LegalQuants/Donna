/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RunProgress from './RunProgress.svelte';

describe('RunProgress', () => {
  it('marks earlier steps done and the current step active', () => {
    render(RunProgress, { props: { phase: 'analysing' } });
    expect(screen.getByText(/Analysing/)).toBeInTheDocument();
    const uploaded = screen.getByText(/Uploaded/);
    expect(uploaded.className).toMatch(/mlq-success/);
  });
  it('shows an error message in the error phase', () => {
    render(RunProgress, { props: { phase: 'error', error: 'unsupported_type' } });
    expect(screen.getByText(/unsupported_type/)).toBeInTheDocument();
  });
});
