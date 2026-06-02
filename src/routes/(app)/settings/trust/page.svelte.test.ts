/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { TrustRow } from '$lib/trust/trust';

const rows: TrustRow[] = [
  { id: 'smart', label: 'Opus 4.7', where: 'Cloud', tone: 'cloud', tier: 4, meaning: 'Anonymized before leaving' },
  { id: 'local', label: 'Llama 3', where: 'Local', tone: 'local', tier: 1, meaning: 'Never leaves your environment' }
];
const tierConfig = { allowed_tiers_global: [1, 2, 3, 4], default_minimum_tier: 1, privileged_minimum_tier: 4, warn_on_tiers: [] };
// `user: null` satisfies the generated PageProps (layout-merged data); page doesn't read it.
const base = (over: Record<string, unknown> = {}) => ({ data: { rows, modelsError: false, tierConfig, user: null, ...over } }) as never;

describe('/settings/trust page', () => {
  it('renders the matrix rows, policy values, and anonymization callout', () => {
    render(Page, base());
    expect(screen.getByRole('heading', { level: 1, name: 'Trust' })).toBeInTheDocument();
    expect(screen.getByText('Opus 4.7', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Llama 3', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Never leaves your environment')).toBeInTheDocument();
    expect(screen.getByText('Anonymized before leaving')).toBeInTheDocument();
    expect(screen.getByText(/Privileged matters/i)).toBeInTheDocument();
    expect(screen.getByText(/anonymization layer/i)).toBeInTheDocument();
  });

  it('shows a fallback note instead of the table when modelsError', () => {
    render(Page, base({ rows: [], modelsError: true }));
    expect(screen.getByText(/couldn.t load the model list/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('omits the tier-policy block when tierConfig is null', () => {
    render(Page, base({ tierConfig: null }));
    expect(screen.queryByText(/Privileged matters/i)).toBeNull();
  });
});
