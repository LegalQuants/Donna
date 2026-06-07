/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/workflows hub', () => {
	it('renders the Workflows heading and the sub-nav', () => {
		render(Page);
		expect(screen.getByRole('heading', { name: 'Workflows', level: 1 })).toBeInTheDocument();
		expect(screen.getByRole('navigation', { name: 'Workflows sections' })).toBeInTheDocument();
	});

	it('renders four cards linking to each tool', () => {
		render(Page);
		const cards = screen.getByTestId('workflows-cards');
		expect(within(cards).getByRole('link', { name: /Skills/ })).toHaveAttribute('href', '/skills');
		expect(within(cards).getByRole('link', { name: /Playbooks/ })).toHaveAttribute(
			'href',
			'/playbooks'
		);
		expect(within(cards).getByRole('link', { name: /Prompts/ })).toHaveAttribute(
			'href',
			'/prompts'
		);
		expect(within(cards).getByRole('link', { name: /Automations/i })).toHaveAttribute(
			'href',
			'/automations'
		);
	});

	it('does not mark any sub-nav segment active on the hub', () => {
		render(Page);
		const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
		expect(nav.querySelector('[aria-current="page"]')).toBeNull();
	});

	it('shows an Automations card linking to /automations', () => {
		render(Page);
		const cards = screen.getByTestId('workflows-cards');
		const link = within(cards).getByRole('link', { name: /automations/i });
		expect(link).toHaveAttribute('href', '/automations');
	});
});
