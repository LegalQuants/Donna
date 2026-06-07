// src/lib/automations/WatchRow.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import WatchRow from './WatchRow.svelte';
import type { WatchSummary } from './watches';

const watch: WatchSummary = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};

describe('WatchRow', () => {
	it('shows the watched KB title, source subtitle, and an On toggle', () => {
		const { container } = render(WatchRow, {
			props: { watch, kbLabel: 'Contracts KB', sourceLabel: 'NDA Review' }
		});
		expect(screen.getByText('Contracts KB')).toBeInTheDocument();
		expect(screen.getByText(/NDA Review · watches for new documents/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^on$/i })).toBeInTheDocument();
		expect(
			(container.querySelector('form[action="?/toggle"] input[name="enabled"]') as HTMLInputElement)
				.value
		).toBe('false');
		expect(
			(container.querySelector('form[action="?/toggle"] input[name="id"]') as HTMLInputElement)
				.value
		).toBe('w1');
	});

	it('links to the edit page and reveals delete only after confirm', async () => {
		const { container } = render(WatchRow, {
			props: {
				watch: { ...watch, enabled: false },
				kbLabel: 'Contracts KB',
				sourceLabel: 'NDA Review'
			}
		});
		expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
			'href',
			'/automations/watches/w1'
		);
		expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
		expect(container.querySelector('form[action="?/delete"]')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
		expect(
			(container.querySelector('form[action="?/delete"] input[name="id"]') as HTMLInputElement)
				.value
		).toBe('w1');
		expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
	});
});
