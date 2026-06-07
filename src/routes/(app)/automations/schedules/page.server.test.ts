// src/routes/(app)/automations/schedules/page.server.test.ts
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

describe('/automations/schedules load', () => {
	it('returns the gate-only shape when not opted in (no list fetch)', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
		); // isAutonomousEnabled
		const out = (await load({} as never)) as { autonomousEnabled: boolean; schedules: unknown[] };
		expect(out.autonomousEnabled).toBe(false);
		expect(out.schedules).toEqual([]);
		expect(lqFetch).toHaveBeenCalledTimes(1); // only the preferences probe
	});

	it('loads schedules + libraries when opted in', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						schedules: [{ id: 's1', cron_expr: '0 9 * * 1', playbook_id: 'p1', enabled: true }]
					}),
					{ status: 200 }
				)
			) // schedules
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
			schedules: unknown[];
			playbookItems: unknown[];
		};
		expect(out.autonomousEnabled).toBe(true);
		expect(out.schedules).toHaveLength(1);
		expect(out.playbookItems).toHaveLength(1);
	});

	it('throws 502 when the schedules fetch fails', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
			.mockResolvedValueOnce(new Response('boom', { status: 500 })) // schedules — hard failure
			.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })); // remaining library fetches
		await expect(load({} as never)).rejects.toMatchObject({ status: 502 });
	});
});

describe('/automations/schedules actions', () => {
	it('create POSTs a schedule body and returns created', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's9' }), { status: 201 }));
		const out = await actions.create(
			formEvent({
				source_mode: 'playbook',
				playbook_id: 'p1',
				cron_expr: '0 9 * * *',
				enabled: 'true'
			})
		);
		expect(out).toMatchObject({ created: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toMatchObject({
			cron_expr: '0 9 * * *',
			playbook_id: 'p1',
			enabled: true
		});
	});
	it('create fails 400 without a source', async () => {
		const out = await actions.create(
			formEvent({ source_mode: 'playbook', cron_expr: '0 9 * * *' })
		);
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('create surfaces a 422 cron error tagged for the field', async () => {
		lqFetch.mockResolvedValueOnce(new Response('bad cron', { status: 422 }));
		const out = await actions.create(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '99 9 * * *' })
		);
		expect(out).toMatchObject({ status: 422, data: { field: 'cron' } });
	});
	it('toggle PATCHes the new enabled value', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 's1', enabled: false }), { status: 200 })
		);
		const out = await actions.toggle(formEvent({ id: 's1', enabled: 'false' }));
		expect(out).toMatchObject({ toggled: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules/s1');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ enabled: false });
	});
	it('delete DELETEs the schedule', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 's1', deleted_at: 'x' }), { status: 200 })
		);
		const out = await actions.delete(formEvent({ id: 's1' }));
		expect(out).toMatchObject({ deleted: true });
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});
});
