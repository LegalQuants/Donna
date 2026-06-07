/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { SessionSummary } from '$lib/automations/types';

const mk = (id: string, trigger: string) => ({
	session: {
		id,
		trigger_kind: trigger,
		current_phase: 'delivery',
		status: 'completed',
		halt_state: 'running',
		cost_total_usd: 0.1,
		max_cost_usd: 2,
		cost_cap_reached: false,
		created_at: '2026-06-04T09:00:00Z',
		completed_at: '2026-06-04T09:04:00Z',
		last_activity_at: null,
		error: null
	} as SessionSummary,
	receipt: null,
	findings: [] as never[],
	findings_total: 0,
	memories: [] as never[]
});

describe('/automations/[id] page', () => {
	it('renders the current session and remounts on id change (no stale session)', async () => {
		const { rerender } = render(Page, { props: { data: mk('s1', 'schedule') } as never });
		expect(screen.getByText('trigger: schedule')).toBeInTheDocument();
		await rerender({ data: mk('s2', 'manual') } as never);
		expect(screen.getByText('trigger: manual')).toBeInTheDocument();
	});

	it('renders a page-level alert when form.error is set (e.g. 403 keep/dismiss failure)', () => {
		render(Page, {
			props: { data: mk('s1', 'manual'), form: { error: 'Automations are turned off.' } } as never
		});
		const alert = screen.getByRole('alert');
		expect(alert).toHaveTextContent('Automations are turned off.');
	});

	it('renders no alert when form is null', () => {
		render(Page, { props: { data: mk('s1', 'manual'), form: null } as never });
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
