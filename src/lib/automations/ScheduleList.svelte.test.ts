// src/lib/automations/ScheduleList.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ScheduleList from './ScheduleList.svelte';
import type { ScheduleSummary } from './schedules';

const schedule: ScheduleSummary = {
	id: 's1',
	name: 'Weekly summary',
	cron_expr: '0 9 * * 1',
	playbook_id: 'p1',
	skill_ref: null,
	target_kb_id: 'kb1',
	project_id: null,
	max_cost_usd: null,
	enabled: true,
	next_run_at: '2026-06-08T09:00:00Z',
	last_run_at: null
};

describe('ScheduleList', () => {
	it('renders an empty state with example use-cases', () => {
		render(ScheduleList, { props: { rows: [] } });
		expect(screen.getByText(/No schedules yet/)).toBeInTheDocument();
		expect(screen.getByText(/weekly summary document/i)).toBeInTheDocument();
	});

	it('renders one row per schedule', () => {
		render(ScheduleList, { props: { rows: [{ schedule, label: 'NDA Review' }] } });
		expect(screen.getByText('Weekly summary')).toBeInTheDocument();
		expect(screen.queryByText(/No schedules yet/)).toBeNull();
	});
});
