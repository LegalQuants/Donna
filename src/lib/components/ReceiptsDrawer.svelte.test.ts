/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ReceiptsDrawer from './ReceiptsDrawer.svelte';

const EVENTS = [
	{ ts: '2026-05-25T05:04:31Z', kind: 'message', detail: { role: 'user' } },
	{
		ts: '2026-05-25T05:04:39Z',
		kind: 'inference',
		detail: {
			provider: 'anthropic-prod',
			model: 'claude-opus-4-7',
			tier: 4,
			refused: false,
			anonymization_applied: false,
			message_id: 'm1'
		}
	}
];

afterEach(() => vi.unstubAllGlobals());

describe('ReceiptsDrawer', () => {
	it('fetches on open and renders rows; export link points at the BFF route', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify(EVENTS), { status: 200 }))
		);
		const { getByText, getByRole } = render(ReceiptsDrawer, {
			props: { chatId: 'c1', open: true, onclose: () => {} }
		});
		await waitFor(() => expect(getByText('claude-opus-4-7')).toBeInTheDocument());
		expect(getByText('You')).toBeInTheDocument();
		const link = getByRole('link', { name: /export/i }) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/chats/c1/receipts/export.jsonl');
	});

	it('filters by kind chip (client-side)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify(EVENTS), { status: 200 }))
		);
		const { getByText, queryByText, getByRole } = render(ReceiptsDrawer, {
			props: { chatId: 'c1', open: true, onclose: () => {} }
		});
		await waitFor(() => expect(getByText('claude-opus-4-7')).toBeInTheDocument());
		await fireEvent.click(getByRole('button', { name: /^message/i })); // toggle message OFF
		expect(queryByText('You')).toBeNull();
		expect(getByText('claude-opus-4-7')).toBeInTheDocument(); // inference still shown
	});

	it('shows an error state with Retry on fetch failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 502 })));
		const { getByText, getByRole } = render(ReceiptsDrawer, {
			props: { chatId: 'c1', open: true, onclose: () => {} }
		});
		await waitFor(() => expect(getByText(/couldn.t load receipts/i)).toBeInTheDocument());
		expect(getByRole('button', { name: /retry/i })).toBeInTheDocument();
	});

	it('calls onclose on Escape', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
		let closed = false;
		const { container } = render(ReceiptsDrawer, {
			props: { chatId: 'c1', open: true, onclose: () => (closed = true) }
		});
		await fireEvent.keyDown(container, { key: 'Escape' });
		expect(closed).toBe(true);
	});

	it('shows "No receipts yet" only after a successful empty fetch, not before loading', async () => {
		let resolve!: (v: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise<Response>((r) => {
					resolve = r;
				})
			)
		);
		const { queryByText } = render(ReceiptsDrawer, {
			props: { chatId: 'c1', open: true, onclose: () => {} }
		});
		// While fetch is in-flight, empty-state must not appear
		expect(queryByText(/no receipts yet/i)).toBeNull();
		// Resolve with an empty array
		resolve(new Response('[]', { status: 200 }));
		await waitFor(() => expect(queryByText(/no receipts yet/i)).toBeInTheDocument());
	});
});
