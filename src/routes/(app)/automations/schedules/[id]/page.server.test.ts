// src/routes/(app)/automations/schedules/[id]/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const ev = (id: string, fields?: Record<string, string>) =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields ?? {}) })
	}) as never;

const sched = {
	id: 's1',
	cron_expr: '0 9 * * 1',
	playbook_id: 'p1',
	skill_ref: null,
	target_kb_id: 'kb1',
	project_id: null,
	max_cost_usd: null,
	enabled: true,
	name: 'Weekly',
	next_run_at: null,
	last_run_at: null
};

function loadMocks(found: boolean) {
	lqFetch
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		) // isAutonomousEnabled
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ schedules: found ? [sched] : [] }), { status: 200 })
		) // schedules
		.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })
		) // playbooks
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // user-skills
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // builtins
		.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })
		) // kbs
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters
}

describe('/automations/schedules/[id] load', () => {
	it('finds the schedule by id', async () => {
		loadMocks(true);
		const out = (await load(ev('s1'))) as { schedule: { id: string } };
		expect(out.schedule.id).toBe('s1');
	});
	it('throws 404 when the id is not in the list', async () => {
		loadMocks(false);
		await expect(load(ev('missing'))).rejects.toMatchObject({ status: 404 });
	});
	it('throws 403 when not opted in', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
		);
		await expect(load(ev('s1'))).rejects.toMatchObject({ status: 403 });
	});
	it('throws 502 when the schedules fetch fails', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
			.mockResolvedValueOnce(new Response('boom', { status: 500 })) // schedules — hard failure
			.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })); // remaining library fetches
		await expect(load(ev('s1'))).rejects.toMatchObject({ status: 502 });
	});
});

describe('/automations/schedules/[id] update', () => {
	it('PATCHes and redirects to the list', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's1' }), { status: 200 }));
		await expect(
			actions.update(
				ev('s1', {
					source_mode: 'playbook',
					playbook_id: 'p1',
					cron_expr: '0 8 * * *',
					enabled: 'true'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/automations/schedules' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules/s1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
	});
	it('surfaces a 422 cron error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('bad', { status: 422 }));
		const out = await actions.update(
			ev('s1', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '99 9 * * *' })
		);
		expect(out).toMatchObject({ status: 422, data: { field: 'cron' } });
	});
	it('fails 400 without a source (no network call)', async () => {
		const out = await actions.update(ev('s1', { source_mode: 'playbook', cron_expr: '0 9 * * *' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('maps a project-ownership 404 to a matter-specific error', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'project not found' }), { status: 404 })
		);
		const out = await actions.update(
			ev('s1', {
				source_mode: 'playbook',
				playbook_id: 'p1',
				cron_expr: '0 9 * * *',
				project_id: 'm-stale'
			})
		);
		expect(out).toMatchObject({ status: 404, data: { field: 'matter' } });
		expect((out as { data: { error: string } }).data.error).toMatch(/matter was not found/i);
	});
	it('keeps the generic message for a schedule-not-found 404', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'autonomous schedule not found' }), { status: 404 })
		);
		const out = await actions.update(
			ev('missing', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *' })
		);
		expect(out).toMatchObject({ status: 404, data: { error: 'Schedule not found.' } });
	});
	it('keeps the generic message for a non-JSON 404 body', async () => {
		lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
		const out = await actions.update(
			ev('s1', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *' })
		);
		expect(out).toMatchObject({ status: 404, data: { error: 'Schedule not found.' } });
	});
});
