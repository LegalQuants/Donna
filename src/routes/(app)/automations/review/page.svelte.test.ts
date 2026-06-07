// src/routes/(app)/automations/review/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import Page from './+page.svelte';
import type { MemoryEntry } from '$lib/automations/memory';

const entry = (over: Partial<MemoryEntry> = {}): MemoryEntry => ({
	id: 'm1',
	state: 'proposed',
	category: 'workflow',
	content: 'Prefers concise summaries.',
	source_session_id: 's1',
	created_at: '2026-06-07T09:00:00Z',
	...over
});

function makeData(overrides: Record<string, unknown> = {}): {
	data: Record<string, unknown>;
	form: null;
} {
	return {
		data: {
			autonomousEnabled: true,
			unread: 0,
			state: 'proposed',
			offset: 0,
			entries: [],
			total: 0,
			...overrides
		},
		form: null
	};
}

describe('/automations/review page', () => {
	it('shows the opt-in gate when autonomous is off', () => {
		render(Page, {
			props: makeData({ autonomousEnabled: false }) as never
		});
		expect(screen.getByText(/Automations are off/)).toBeInTheDocument();
	});

	it('renders the segmented control with Proposed checked for state=proposed', () => {
		render(Page, { props: makeData() as never });
		const group = screen.getByRole('radiogroup', { name: /memory state/i });
		expect(group).toBeInTheDocument();
		const proposedBtn = within(group).getByRole('radio', { name: /proposed/i });
		expect(proposedBtn).toHaveAttribute('aria-checked', 'true');
		const keptBtn = within(group).getByRole('radio', { name: /kept/i });
		expect(keptBtn).toHaveAttribute('aria-checked', 'false');
		const dismissedBtn = within(group).getByRole('radio', { name: /dismissed/i });
		expect(dismissedBtn).toHaveAttribute('aria-checked', 'false');
	});

	it('renders two entry rows when entries are provided', () => {
		render(Page, {
			props: makeData({
				entries: [
					entry({ id: 'm1', content: 'First memory' }),
					entry({ id: 'm2', content: 'Second memory' })
				],
				total: 2
			}) as never
		});
		expect(screen.getByText('First memory')).toBeInTheDocument();
		expect(screen.getByText('Second memory')).toBeInTheDocument();
	});

	it('shows proposed empty-state copy when state=proposed and no entries', () => {
		render(Page, { props: makeData({ state: 'proposed', entries: [], total: 0 }) as never });
		expect(
			screen.getByText('No proposed memories. Runs propose memories as they work.')
		).toBeInTheDocument();
	});

	it('shows kept empty-state copy when state=kept and no entries', () => {
		render(Page, { props: makeData({ state: 'kept', entries: [], total: 0 }) as never });
		expect(screen.getByText('Nothing kept yet.')).toBeInTheDocument();
	});

	it('shows dismissed empty-state copy when state=dismissed and no entries', () => {
		render(Page, { props: makeData({ state: 'dismissed', entries: [], total: 0 }) as never });
		expect(screen.getByText('Nothing dismissed.')).toBeInTheDocument();
	});

	it('shows error alert when data.error is set', () => {
		render(Page, {
			props: makeData({ error: true, entries: [], total: 0 }) as never
		});
		expect(screen.getByRole('alert')).toHaveTextContent(
			"Couldn't load memories — reload to retry."
		);
	});

	it('pagination: correct hrefs for total=120, offset=50 (Prev → 0, Next → 100)', () => {
		render(Page, {
			props: makeData({
				state: 'proposed',
				offset: 50,
				entries: [
					entry({ id: 'm1' }),
					entry({ id: 'm2' }),
					entry({ id: 'm3' }),
					entry({ id: 'm4' }),
					entry({ id: 'm5' })
				],
				total: 120
			}) as never
		});
		const prevLink = screen.getByRole('link', { name: /prev/i });
		const nextLink = screen.getByRole('link', { name: /next/i });
		expect(prevLink).toHaveAttribute('href', '?state=proposed&offset=0');
		expect(nextLink).toHaveAttribute('href', '?state=proposed&offset=100');
	});

	it('pagination: Prev hidden when offset=0', () => {
		render(Page, {
			props: makeData({
				state: 'proposed',
				offset: 0,
				entries: Array.from({ length: 50 }, (_, i) =>
					entry({ id: `m${i}`, content: `Memory ${i}` })
				),
				total: 120
			}) as never
		});
		expect(screen.queryByRole('link', { name: /prev/i })).toBeNull();
		expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
			'href',
			'?state=proposed&offset=50'
		);
	});

	it('pagination: Next hidden on last page', () => {
		render(Page, {
			props: makeData({
				state: 'proposed',
				offset: 100,
				entries: Array.from({ length: 20 }, (_, i) =>
					entry({ id: `m${i}`, content: `Memory ${i}` })
				),
				total: 120
			}) as never
		});
		expect(screen.getByRole('link', { name: /prev/i })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /next/i })).toBeNull();
	});

	it('page-level form error (no id) renders a page-level alert', () => {
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					state: 'proposed',
					offset: 0,
					entries: [],
					total: 0
				},
				form: { error: 'Automations are turned off.' }
			} as never
		});
		const alert = screen.getByRole('alert');
		expect(alert).toHaveTextContent('Automations are turned off.');
	});

	it('row-scoped form error (with id) does NOT render a page-level alert', () => {
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					state: 'proposed',
					offset: 0,
					entries: [entry({ id: 'mA', content: 'Alpha' })],
					total: 1
				},
				form: { id: 'mA', error: 'This memory no longer exists.' }
			} as never
		});
		// The row-scoped alert from MemoryRow exists, but there is no additional
		// page-level alert above the list.
		const alerts = screen.getAllByRole('alert');
		// Only 1 alert total — the row one; no duplicate page-level alert.
		expect(alerts).toHaveLength(1);
		// Confirm it's the row error, not some other text.
		expect(alerts[0]).toHaveTextContent('This memory no longer exists.');
	});

	it('row-scoped error reaches the correct MemoryRow', () => {
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					state: 'proposed',
					offset: 0,
					entries: [entry({ id: 'mA', content: 'Alpha' }), entry({ id: 'mB', content: 'Beta' })],
					total: 2
				},
				form: { id: 'mB', error: 'This memory no longer exists.' }
			} as never
		});
		// The alert should appear and contain the error for mB
		const alert = screen.getByRole('alert');
		expect(alert).toHaveTextContent('This memory no longer exists.');
		// The Alpha row should NOT have an alert
		expect(screen.queryAllByRole('alert')).toHaveLength(1);
	});
});
