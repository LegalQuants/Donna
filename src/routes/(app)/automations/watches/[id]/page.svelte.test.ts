// src/routes/(app)/automations/watches/[id]/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const watch = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};
const kbs = [
	{
		id: 'kb1',
		name: 'Contracts KB',
		owner_id: 'u1',
		hybrid_alpha: 0.5,
		file_count: 0,
		chunk_count: 0,
		created_at: 'x',
		updated_at: 'x'
	}
];

describe('/automations/watches/[id] page', () => {
	it('renders the edit form with a Save changes button and the read-only KB', () => {
		render(Page, {
			props: {
				data: {
					watch,
					unread: 0,
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs,
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
		expect(screen.getByText(/Watching: Contracts KB/i)).toBeInTheDocument();
	});
});
