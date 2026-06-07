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

// Helper: set up lqFetch for isAutonomousEnabled → true, then unreadCount, then memory list,
// then precedents, proposals, matters (the 3 new parallel fetches).
const withOptedIn = (
	memoryRes: Response,
	opts: {
		precedentsRes?: Response;
		proposalsRes?: Response;
		mattersRes?: Response;
	} = {}
) => {
	const precedentsRes =
		opts.precedentsRes ??
		new Response(JSON.stringify({ entries: [], total_count: 0 }), { status: 200 });
	const proposalsRes =
		opts.proposalsRes ??
		new Response(JSON.stringify({ proposals: [], total_count: 0 }), { status: 200 });
	const mattersRes = opts.mattersRes ?? new Response(JSON.stringify([]), { status: 200 });

	lqFetch
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		) // isAutonomousEnabled
		.mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 })) // unreadCount (notifications)
		.mockResolvedValueOnce(memoryRes) // memory fetch
		.mockResolvedValueOnce(precedentsRes) // precedents fetch
		.mockResolvedValueOnce(proposalsRes) // proposals fetch
		.mockResolvedValueOnce(mattersRes); // matters/projects fetch
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
		// total_count=100 so offset=50 does NOT trigger the stale-offset clamp (50 < 100)
		withOptedIn(memoryListRes([], 100));
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
			.mockResolvedValueOnce(new Response('boom', { status: 500 })) // memory fetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ entries: [], total_count: 0 }), { status: 200 })
			) // precedents
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ proposals: [], total_count: 0 }), { status: 200 })
			) // proposals
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters
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
		// total_count=200 so offset=100 does NOT trigger the stale-offset clamp (100 < 200)
		withOptedIn(memoryListRes([], 200));
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

	// --- NEW: precedents + proposals + matters load ---

	it('includes parsed precedents list in load result', async () => {
		withOptedIn(memoryListRes(), {
			precedentsRes: new Response(
				JSON.stringify({
					entries: [
						{
							id: 'prec1',
							pattern_kind: 'recurring-clause',
							summary: 'Vendor accepts 30-day termination.',
							observed_count: 3,
							source_session_id: null,
							created_at: '2026-06-07T09:00:00Z',
							updated_at: '2026-06-07T09:00:00Z'
						}
					],
					total_count: 1
				}),
				{ status: 200 }
			)
		});
		const out = (await load(loadEvent())) as {
			precedents: { entries: { id: string }[]; total: number } | null;
		};
		expect(out.precedents).not.toBeNull();
		expect(out.precedents!.entries).toHaveLength(1);
		expect(out.precedents!.entries[0].id).toBe('prec1');
		expect(out.precedents!.total).toBe(1);
	});

	it('includes parsed proposals list in load result', async () => {
		withOptedIn(memoryListRes(), {
			proposalsRes: new Response(
				JSON.stringify({
					proposals: [
						{
							id: 'prop1',
							precedent_id: 'prec1',
							project_id: 'proj1',
							suggested_md: '## Context\nVendor accepts 30-day termination.',
							state: 'proposed',
							created_at: '2026-06-07T09:00:00Z',
							updated_at: '2026-06-07T09:00:00Z'
						}
					],
					total_count: 1
				}),
				{ status: 200 }
			),
			mattersRes: new Response(JSON.stringify([{ id: 'proj1', name: 'Acme MSA' }]), {
				status: 200
			})
		});
		const out = (await load(loadEvent())) as {
			proposals: { proposals: { id: string; project_id: string }[]; total: number } | null;
			matters: { id: string; name: string }[];
		};
		expect(out.proposals).not.toBeNull();
		expect(out.proposals!.proposals).toHaveLength(1);
		expect(out.proposals!.proposals[0].id).toBe('prop1');
		expect(out.matters).toEqual([{ id: 'proj1', name: 'Acme MSA' }]);
	});

	it('precedents fetch failing → precedents: null (other keys unaffected)', async () => {
		withOptedIn(memoryListRes(), {
			precedentsRes: new Response('Server Error', { status: 500 })
		});
		const out = (await load(loadEvent())) as {
			precedents: null | unknown;
			proposals: null | unknown;
			matters: unknown[];
		};
		expect(out.precedents).toBeNull();
		// proposals + matters should still succeed
		expect(out.proposals).not.toBeNull();
		expect(Array.isArray(out.matters)).toBe(true);
	});

	it('proposals fetch failing → proposals: null (precedents unaffected)', async () => {
		withOptedIn(memoryListRes(), {
			proposalsRes: new Response('Server Error', { status: 500 })
		});
		const out = (await load(loadEvent())) as {
			precedents: null | unknown;
			proposals: null | unknown;
		};
		expect(out.proposals).toBeNull();
		expect(out.precedents).not.toBeNull();
	});

	it('matters fetch failing → matters: [] (precedents/proposals unaffected)', async () => {
		withOptedIn(memoryListRes(), {
			mattersRes: new Response('Server Error', { status: 500 })
		});
		const out = (await load(loadEvent())) as {
			matters: unknown[];
			precedents: null | unknown;
			proposals: null | unknown;
		};
		expect(out.matters).toEqual([]);
		expect(out.precedents).not.toBeNull();
		expect(out.proposals).not.toBeNull();
	});

	it('not-opted-in early return includes precedents/proposals/matters keys', async () => {
		withOptedOut();
		const out = (await load(loadEvent())) as {
			autonomousEnabled: boolean;
			precedents: null | unknown;
			proposals: null | unknown;
			matters: unknown[];
		};
		expect(out.autonomousEnabled).toBe(false);
		expect(out.precedents).toBeNull();
		expect(out.proposals).toBeNull();
		expect(out.matters).toEqual([]);
	});

	it('stale offset clamp: offset >= total → 303 redirect to clamped offset', async () => {
		// total=10, offset=50 → redirect to offset=0
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 })) // unreadCount
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ entries: [], total_count: 10, limit: 50, offset: 50 }), {
					status: 200
				})
			) // memory fetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ entries: [], total_count: 0 }), { status: 200 })
			) // precedents
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ proposals: [], total_count: 0 }), { status: 200 })
			) // proposals
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters

		let thrown: unknown;
		try {
			await load(loadEvent({ state: 'proposed', offset: '50' }));
		} catch (e) {
			thrown = e;
		}
		// SvelteKit redirect throws a Response with status 303
		expect(thrown).toBeDefined();
		const r = thrown as { status: number; location?: string; headers?: Headers };
		expect(r.status).toBe(303);
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

	// --- NEW action tests ---

	it('memory keep 422 surfaces errorDetail', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'validation constraint hit' }), { status: 422 })
		);
		const out = await actions.keep(formEvent({ id: 'm1' }));
		expect(out).toMatchObject({
			status: 422,
			data: { error: 'validation constraint hit', id: 'm1' }
		});
	});

	it('dismissPrecedent POSTs to .../precedents/{id}/dismiss → ok:true', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prec1' }), { status: 200 }));
		const out = await actions.dismissPrecedent(formEvent({ id: 'prec1' }));
		expect(out).toMatchObject({ ok: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/precedents/prec1/dismiss');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
	});

	it('promote missing project_id → fail(400) with id', async () => {
		const out = await actions.promote(formEvent({ id: 'prec1' }));
		expect(out).toMatchObject({
			status: 400,
			data: { error: 'Pick a matter first.', id: 'prec1' }
		});
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('promote with project_id sends body { project_id } → ok:true + promoted:true', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prop1' }), { status: 200 }));
		const out = await actions.promote(formEvent({ id: 'prec1', project_id: 'proj1' }));
		expect(out).toMatchObject({ ok: true, promoted: true });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(body).toEqual({ project_id: 'proj1' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/precedents/prec1/promote');
	});

	it('acceptProposal 422 with detail message → fail(422) surfacing detail', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'context document is full' }), { status: 422 })
		);
		const out = await actions.acceptProposal(formEvent({ id: 'prop1' }));
		expect(out).toMatchObject({
			status: 422,
			data: { error: 'context document is full', id: 'prop1' }
		});
	});

	it('rejectProposal POSTs to .../project-context-proposals/{id}/reject → ok:true', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prop1' }), { status: 200 }));
		const out = await actions.rejectProposal(formEvent({ id: 'prop1' }));
		expect(out).toMatchObject({ ok: true });
		expect(lqFetch.mock.calls[0][1]).toBe(
			'/api/v1/autonomous/project-context-proposals/prop1/reject'
		);
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
	});

	it('dismissPrecedent 404 → fail(404) with id', async () => {
		lqFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));
		const out = await actions.dismissPrecedent(formEvent({ id: 'prec1' }));
		expect(out).toMatchObject({
			status: 404,
			data: { error: 'This item no longer exists.', id: 'prec1' }
		});
	});
});
