// src/routes/(app)/automations/schedules/[id]/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const schedule = {
	id: 's1',
	name: 'Weekly',
	cron_expr: '0 9 * * 1',
	playbook_id: 'p1',
	skill_ref: null,
	target_kb_id: 'kb1',
	project_id: null,
	max_cost_usd: null,
	enabled: true,
	next_run_at: null,
	last_run_at: null
};

describe('/automations/schedules/[id] page', () => {
	it('renders the edit form with a Save changes button', () => {
		render(Page, {
			props: {
				data: {
					schedule,
					unread: 0,
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs: [],
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
	});
});
