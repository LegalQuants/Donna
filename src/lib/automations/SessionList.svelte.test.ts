/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionList from './SessionList.svelte';
import type { SessionSummary } from './types';

const row: SessionSummary = {
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

describe('SessionList', () => {
	it('renders an empty state when there are no sessions', () => {
		render(SessionList, { props: { sessions: [] } });
		expect(screen.getByText(/no automations yet/i)).toBeInTheDocument();
	});
	it('renders a row linking to the session receipt', () => {
		render(SessionList, { props: { sessions: [row] } });
		const link = screen.getByRole('link', { name: /schedule/i });
		expect(link).toHaveAttribute('href', '/automations/s1');
		expect(screen.getByText('completed')).toBeInTheDocument();
		expect(screen.getByText('$0.42')).toBeInTheDocument();
	});
});
