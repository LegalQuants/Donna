// src/routes/(app)/automations/watches/page.server.test.ts
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

describe('/automations/watches load', () => {
	it('returns the gate-only shape when not opted in (no list fetch)', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
		);
		const out = (await load({} as never)) as { autonomousEnabled: boolean; watches: unknown[] };
		expect(out.autonomousEnabled).toBe(false);
		expect(out.watches).toEqual([]);
		expect(lqFetch).toHaveBeenCalledTimes(1);
	});

	it('loads watches + libraries when opted in', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						watches: [{ id: 'w1', knowledge_base_id: 'kb1', playbook_id: 'p1', enabled: true }]
					}),
					{ status: 200 }
				)
			) // watches
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })
			) // playbooks
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ slug: 'mine', display_name: 'Mine' }]), { status: 200 })
			) // user-skills
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ name: 'comms', title: 'Comms' }]), { status: 200 })
			) // builtins
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })
			) // kbs
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			); // matters
		const out = (await load({} as never)) as {
			autonomousEnabled: boolean;
			watches: unknown[];
			playbookItems: unknown[];
		};
		expect(out.autonomousEnabled).toBe(true);
		expect(out.watches).toHaveLength(1);
		expect(out.playbookItems).toHaveLength(1);
	});

	it('throws 502 when the watches fetch fails', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			)
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }))
			.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
		await expect(load({} as never)).rejects.toMatchObject({ status: 502 });
	});
});

describe('/automations/watches actions', () => {
	it('create POSTs a watch body and returns created', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w9' }), { status: 201 }));
		const out = await actions.create(
			formEvent({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				enabled: 'true'
			})
		);
		expect(out).toMatchObject({ created: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toMatchObject({
			playbook_id: 'p1',
			knowledge_base_id: 'kb1',
			enabled: true
		});
	});
	it('create fails 400 without a KB', async () => {
		const out = await actions.create(formEvent({ source_mode: 'playbook', playbook_id: 'p1' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('create maps a backend 404 to a KB form error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('no kb', { status: 404 }));
		const out = await actions.create(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kbX' })
		);
		expect(out).toMatchObject({ status: 404 });
		expect((out as { data: { error: string } }).data.error).toMatch(/knowledge base/i);
	});
	it('toggle PATCHes the new enabled value', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'w1', enabled: false }), { status: 200 })
		);
		const out = await actions.toggle(formEvent({ id: 'w1', enabled: 'false' }));
		expect(out).toMatchObject({ toggled: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches/w1');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ enabled: false });
	});
	it('delete DELETEs the watch', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w1' }), { status: 200 }));
		const out = await actions.delete(formEvent({ id: 'w1' }));
		expect(out).toMatchObject({ deleted: true });
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});
});
