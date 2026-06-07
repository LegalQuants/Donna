// src/routes/(app)/automations/schedules/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const libs = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/schedules page', () => {
	it('shows the opt-in gate when autonomous is off', () => {
		render(Page, {
			props: {
				data: { autonomousEnabled: false, unread: 0, schedules: [], ...libs },
				form: null
			} as never
		});
		expect(screen.getByText(/Automations are off/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /new schedule/i })).toBeNull();
	});

	it('shows the New schedule control and the list when opted in', () => {
		const schedule = {
			id: 's1',
			name: 'Weekly',
			cron_expr: '0 9 * * 1',
			playbook_id: 'p1',
			skill_ref: null,
			target_kb_id: null,
			project_id: null,
			max_cost_usd: null,
			enabled: true,
			next_run_at: null,
			last_run_at: null
		};
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					schedules: [schedule],
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs: [],
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.getByRole('button', { name: /new schedule/i })).toBeInTheDocument();
		expect(screen.getByText('Weekly')).toBeInTheDocument();
	});

	it('shows a failed toggle/delete error at page level even with the create form closed', () => {
		render(Page, {
			props: {
				data: { autonomousEnabled: true, unread: 0, schedules: [], ...libs },
				form: { error: 'Could not update the schedule.' }
			} as never
		});
		expect(screen.queryByRole('button', { name: /save schedule/i })).toBeNull(); // form closed
		expect(screen.getByRole('alert')).toHaveTextContent(/could not update the schedule/i);
	});

	it('reveals the inline create form when "New schedule" is clicked', async () => {
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					schedules: [],
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs: [],
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.queryByRole('button', { name: /save schedule/i })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /new schedule/i }));
		expect(screen.getByRole('button', { name: /save schedule/i })).toBeInTheDocument();
	});
});
