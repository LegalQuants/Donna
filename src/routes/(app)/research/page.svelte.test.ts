import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('research page', () => {
	it('shows the gate when disabled', () => {
		render(Page, { data: { capabilities: { enabled: false, providers: [] } } } as never);
		expect(screen.getByText(/isn’t enabled/i)).toBeInTheDocument();
	});
	it('shows the search box when enabled', () => {
		render(Page, {
			data: { capabilities: { enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] } }
		} as never);
		expect(screen.getByRole('searchbox', { name: /search case law/i })).toBeInTheDocument();
	});
});
