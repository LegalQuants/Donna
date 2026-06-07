// src/routes/(app)/automations/review/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const formEvent = (fields: Record<string, string>) =>
	({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;

const loadEvent = (params: Record<string, string> = {}) =>
	({
		url: new URL('http://x?' + new URLSearchParams(params).toString())
	}) as never;

// Helper: set up lqFetch for isAutonomousEnabled → true, then unreadCount, then memory list
const withOptedIn = (memoryRes: Response) => {
	lqFetch
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		) // isAutonomousEnabled
		.mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 })) // unreadCount (notifications)
		.mockResolvedValueOnce(memoryRes); // memory fetch
};

const withOptedOut = () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
	); // isAutonomousEnabled
};

const memoryListRes = (entries: unknown[] = [], total_count = 0) =>
	new Response(JSON.stringify({ entries, total_count, limit: 50, offset: 0 }), { status: 200 });

describe('/automations/review load', () => {
	it('state defaults to "proposed" when ?state= is missing or invalid', async () => {
		withOptedIn(memoryListRes());
		const out = (await load(loadEvent({ state: 'junk' }))) as { state: string };
		expect(out.state).toBe('proposed');
	});

	it('accepts a valid state from MEMORY_STATES', async () => {
		withOptedIn(memoryListRes());
		const out = (await load(loadEvent({ state: 'kept' }))) as { state: string };
		expect(out.state).toBe('kept');
	});

	it('parses offset from searchParams', async () => {
		withOptedIn(memoryListRes());
		const out = (await load(loadEvent({ state: 'proposed', offset: '50' }))) as { offset: number };
		expect(out.offset).toBe(50);
	});

	it('defaults offset to 0 for invalid values', async () => {
		withOptedIn(memoryListRes());
		const out = (await load(loadEvent({ offset: 'bad' }))) as { offset: number };
		expect(out.offset).toBe(0);
	});

	it('returns error shape on non-OK response', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 })) // unreadCount
			.mockResolvedValueOnce(new Response('boom', { status: 500 })); // memory fetch
		const out = (await load(loadEvent())) as {
			error: boolean;
			entries: unknown[];
			total: number;
			state: string;
			offset: number;
		};
		expect(out.error).toBe(true);
		expect(out.entries).toEqual([]);
		expect(out.total).toBe(0);
		expect(out.state).toBe('proposed');
		expect(out.offset).toBe(0);
	});

	it('returns parsed entries on OK response', async () => {
		withOptedIn(
			memoryListRes(
				[
					{
						id: 'm1',
						state: 'proposed',
						category: 'workflow',
						content: 'Prefers concise.',
						source_session_id: null,
						created_at: '2026-06-07T09:00:00Z',
						updated_at: '2026-06-07T09:00:00Z'
					}
				],
				1
			)
		);
		const out = (await load(loadEvent())) as { entries: unknown[]; total: number };
		expect(out.entries).toHaveLength(1);
		expect(out.total).toBe(1);
	});

	it('passes correct query params to the memory fetch (state, limit=50, offset)', async () => {
		withOptedIn(memoryListRes());
		await load(loadEvent({ state: 'kept', offset: '100' }));
		// calls: [0]=isAutonomousEnabled, [1]=unreadCount, [2]=memory fetch
		const url: string = lqFetch.mock.calls[2][1];
		expect(url).toContain('state=kept');
		expect(url).toContain('limit=50');
		expect(url).toContain('offset=100');
	});

	it('includes autonomousEnabled from isAutonomousEnabled (not opted in)', async () => {
		withOptedOut();
		const out = (await load(loadEvent())) as { autonomousEnabled: boolean };
		expect(out.autonomousEnabled).toBe(false);
	});
});

describe('/automations/review actions', () => {
	it('keep without content sends no content key in body', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
		const out = await actions.keep(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({ ok: true });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(body).not.toHaveProperty('content');
	});

	it('keep with whitespace-only content sends no content key in body', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
		const out = await actions.keep(formEvent({ id: 'm1', content: '   ' }));
		expect(out).toMatchObject({ ok: true });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(body).not.toHaveProperty('content');
	});

	it('keep with content sends { content } in body', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
		const out = await actions.keep(formEvent({ id: 'm1', content: 'edited' }));
		expect(out).toMatchObject({ ok: true });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(body).toEqual({ content: 'edited' });
	});

	it('keep POSTs to .../keep endpoint', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
		await actions.keep(formEvent({ id: 'm1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/memory/m1/keep');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
	});

	it('dismiss POSTs to .../dismiss endpoint', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
		const out = await actions.dismiss(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({ ok: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/memory/m1/dismiss');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
	});

	it('delete uses DELETE method', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
		const out = await actions.delete(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({ ok: true });
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/memory/m1');
	});

	it('missing id returns 400', async () => {
		const out = await actions.keep(formEvent({}));
		expect(out).toMatchObject({ status: 400, data: { error: 'Missing memory id.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('404 mapping echoes id', async () => {
		lqFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));
		const out = await actions.keep(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({
			status: 404,
			data: { error: 'This memory no longer exists.', id: 'm1' }
		});
	});

	it('403 mapping returns "Automations are turned off."', async () => {
		lqFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
		const out = await actions.dismiss(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({ status: 403, data: { error: 'Automations are turned off.' } });
	});

	it('other non-OK → 502 with generic message and id', async () => {
		lqFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
		const out = await actions.delete(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({
			status: 502,
			data: { error: 'Could not update the memory.', id: 'm1' }
		});
	});
});
