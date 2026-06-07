// src/lib/automations/AutomationsNav.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import AutomationsNav from './AutomationsNav.svelte';

describe('AutomationsNav', () => {
	it('marks the active tab and links to both views', () => {
		render(AutomationsNav, { props: { active: 'sessions', unread: 0 } });
		const nav = screen.getByRole('navigation', { name: 'Automations views' });
		expect(within(nav).getByRole('link', { name: /sessions/i })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(within(nav).getByRole('link', { name: /notifications/i })).toHaveAttribute(
			'href',
			'/automations/notifications'
		);
	});
	it('shows an unread count when > 0', () => {
		render(AutomationsNav, { props: { active: 'notifications', unread: 3 } });
		expect(screen.getByText('3')).toBeInTheDocument();
	});
	it('renders a Schedules tab linking to /automations/schedules, current when active', () => {
		render(AutomationsNav, { props: { active: 'schedules' } });
		const link = screen.getByRole('link', { name: /schedules/i });
		expect(link).toHaveAttribute('href', '/automations/schedules');
		expect(link).toHaveAttribute('aria-current', 'page');
	});
	it('renders a Watches tab linking to /automations/watches, current when active', () => {
		render(AutomationsNav, { props: { active: 'watches' } });
		const link = screen.getByRole('link', { name: /watches/i });
		expect(link).toHaveAttribute('href', '/automations/watches');
		expect(link).toHaveAttribute('aria-current', 'page');
	});
	it('renders a Review tab linking to /automations/review, current when active', () => {
		render(AutomationsNav, { props: { active: 'review' } });
		const link = screen.getByRole('link', { name: /review/i });
		expect(link).toHaveAttribute('href', '/automations/review');
		expect(link).toHaveAttribute('aria-current', 'page');
	});
});
