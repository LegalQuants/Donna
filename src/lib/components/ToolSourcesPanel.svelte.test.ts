import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ToolSourcesPanel from './ToolSourcesPanel.svelte';
import type { ToolSource } from '$lib/citations/sources';

const row = (over: Partial<ToolSource> = {}): ToolSource => ({
	id: 's1',
	message_id: 'm1',
	source_kind: 'caselaw',
	label: 'Roe v. Wade, 410 U.S. 113 (1973)',
	subtitle: 'U.S. Supreme Court · 1973',
	url: 'https://www.courtlistener.com/opinion/108713/roe-v-wade/',
	external_ref: '108713',
	provider: 'courtlistener',
	tool: 'search_case_law',
	created_at: null,
	...over
});

describe('ToolSourcesPanel', () => {
	it('renders a header with the count and one row per source', () => {
		render(ToolSourcesPanel, {
			sources: [
				row(),
				row({
					id: 's2',
					label: 'Second',
					external_ref: '999999',
					subtitle: 'Lower Court · 2020',
					url: null
				})
			]
		});
		expect(screen.getByText(/Sources consulted \(2\)/i)).toBeInTheDocument();
		expect(screen.getByText('Roe v. Wade, 410 U.S. 113 (1973)')).toBeInTheDocument();
		expect(screen.getByText('U.S. Supreme Court · 1973')).toBeInTheDocument();
		// exactly one link rendered (row with url); row without url has no link
		expect(screen.queryAllByRole('link')).toHaveLength(1);
		// row with a url renders an external link; opens in a new tab, safely.
		const link = screen.getByRole('link', { name: /courtlistener/i });
		expect(link).toHaveAttribute('href', row().url);
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
	});

	it('renders nothing when there are no sources', () => {
		const { container } = render(ToolSourcesPanel, { sources: [] });
		expect(container.textContent?.trim()).toBe('');
	});
});
