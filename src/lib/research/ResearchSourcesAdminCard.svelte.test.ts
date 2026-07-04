/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Card from './ResearchSourcesAdminCard.svelte';
import type { ToolProviderRow } from './toolProviders';

const rows: ToolProviderRow[] = [
	{
		type: 'courtlistener',
		enabled: false,
		name: 'courtlistener-prod',
		has_key: false,
		key_required: true,
		egress_tier: 4
	},
	{
		type: 'edgar',
		enabled: true,
		name: 'edgar-prod',
		has_key: false,
		key_required: false,
		egress_tier: 4
	}
];

describe('ResearchSourcesAdminCard', () => {
	it('renders a row per source with badges and keyed vs keyless controls', () => {
		render(Card, { props: { isAdmin: true, sources: rows, form: null } });
		expect(screen.getByText(/CourtListener/)).toBeInTheDocument();
		expect(screen.getByText(/SEC EDGAR/)).toBeInTheDocument();
		// keyless enabled edgar → Available + a Disable control
		expect(screen.getByText('Available')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
		// keyed courtlistener (no key) → a Set key control, no rendered key
		expect(screen.getByRole('button', { name: /set key/i })).toBeInTheDocument();
	});
	it('shows a non-admin note and no controls', () => {
		render(Card, { props: { isAdmin: false, sources: null, form: null } });
		expect(screen.getByText(/managed by your administrator/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /enable|disable|set key/i })).toBeNull();
	});
	it('surfaces a row-scoped error from form', () => {
		render(Card, {
			props: {
				isAdmin: true,
				sources: rows,
				form: { type: 'courtlistener', message: 'runtime key storage is disabled' }
			}
		});
		expect(screen.getByText(/runtime key storage is disabled/i)).toBeInTheDocument();
	});
});
