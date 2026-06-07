/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/automations index', () => {
	it('renders Workflows nav with Automations active and the empty state', () => {
		render(Page, {
			props: { data: { sessions: [], unread: 0, autonomousEnabled: true } } as never
		});
		const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
		expect(within(nav).getByRole('link', { name: 'Automations' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(screen.getByText(/no automations yet/i)).toBeInTheDocument();
	});
	it('shows Run now when opted in', () => {
		render(Page, {
			props: { data: { sessions: [], unread: 0, autonomousEnabled: true } } as never
		});
		expect(screen.getByRole('link', { name: 'Run now' })).toHaveAttribute(
			'href',
			'/automations/new'
		);
	});
	it('shows the opt-in gate when not opted in', () => {
		render(Page, {
			props: { data: { sessions: [], unread: 0, autonomousEnabled: false } } as never
		});
		expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
	});
	it('shows the gate and history (no Run now) when off but sessions exist', () => {
		const session = {
			id: 's1',
			trigger_kind: 'schedule',
			current_phase: 'delivery',
			status: 'completed',
			halt_state: 'running',
			cost_total_usd: 0.42,
			max_cost_usd: 2,
			cost_cap_reached: false,
			created_at: '2026-06-04T09:00:00Z',
			completed_at: '2026-06-04T09:04:00Z',
			last_activity_at: null,
			error: null
		};
		render(Page, {
			props: { data: { sessions: [session], unread: 0, autonomousEnabled: false } } as never
		});
		expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /schedule session, completed/i })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Run now' })).not.toBeInTheDocument();
	});
});
