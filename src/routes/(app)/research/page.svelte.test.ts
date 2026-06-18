import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';

const enabled = {
	data: { capabilities: { enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] } }
} as never;

describe('research page', () => {
	it('shows the gate when disabled', () => {
		render(Page, { data: { capabilities: { enabled: false, providers: [] } } } as never);
		expect(screen.getByText(/isn’t enabled/i)).toBeInTheDocument();
	});
	it('shows the search box when enabled', () => {
		render(Page, {
			data: { capabilities: { enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] } }
		} as never);
		expect(screen.getByRole('searchbox', { name: /search case law/i })).toBeInTheDocument();
	});
	it('shows court input and order_by select when enabled', () => {
		render(Page, {
			data: { capabilities: { enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] } }
		} as never);
		expect(screen.getByPlaceholderText(/court/i)).toBeInTheDocument();
		expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument();
	});

	it('does not show Load more before any search', () => {
		render(Page, enabled);
		expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
	});

	it('shows Load more after a page with a next cursor and pages forward on click', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						count: 5,
						next_cursor: 'CUR1',
						results: [{ cluster_id: 1, case_name: 'A v. B' }]
					}),
					{ status: 200 }
				)
		);
		vi.stubGlobal('fetch', fetchMock);
		try {
			render(Page, enabled);
			await fireEvent.input(screen.getByRole('searchbox', { name: /search case law/i }), {
				target: { value: 'chevron' }
			});
			await fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

			const more = await screen.findByRole('button', { name: /load more/i });
			expect(more).toBeInTheDocument();

			await fireEvent.click(more);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
			const secondBody = JSON.parse(String(calls[1][1].body));
			expect(secondBody.cursor).toBe('CUR1');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
