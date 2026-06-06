/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProviderKeysCard from './ProviderKeysCard.svelte';
import type { ProviderKeyRow } from './providerKeys';

const rows: ProviderKeyRow[] = [
  { provider: 'anthropic-prod', type: 'anthropic', configured: true, last4: 'a1b2', source: 'env' },
  { provider: 'openai-prod', type: 'openai', configured: false, last4: null, source: null }
];

describe('ProviderKeysCard', () => {
  it('admin: renders one row per provider with the sub-copy', () => {
    render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: rows, form: null } });
    expect(screen.getByRole('heading', { name: /provider keys/i })).toBeInTheDocument();
    expect(screen.getByText(/encrypted at rest .* applied immediately/i)).toBeInTheDocument();
    expect(screen.getByText('anthropic-prod')).toBeInTheDocument();
    expect(screen.getByText('openai-prod')).toBeInTheDocument();
  });
  it('routes a row-scoped error to the matching row only', () => {
    render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: rows, form: { provider: 'openai-prod', message: 'Unknown provider.' } } });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Unknown provider.');
  });
  it('admin: empty list → no-providers note', () => {
    render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: [], form: null } });
    expect(screen.getByText('No providers are configured in the gateway.')).toBeInTheDocument();
  });
  it('admin: failed fetch (null) → degraded message', () => {
    render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: null, form: null } });
    expect(screen.getByText('Could not load provider keys right now.')).toBeInTheDocument();
  });
  it('non-admin: managed-by-administrator note, no rows', () => {
    render(ProviderKeysCard, { props: { isAdmin: false, providerKeys: null, form: null } });
    expect(screen.getByText('Provider API keys are managed by your administrator.')).toBeInTheDocument();
    expect(screen.queryByText('anthropic-prod')).toBeNull();
  });
});
