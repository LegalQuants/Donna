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

describe('/automations/new load', () => {
	it('loads libraries + opt-in', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'p1', name: 'NDA', contract_type: 'NDA' }]), {
					status: 200
				})
			) // playbooks
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ slug: 'mine', display_name: 'Mine', description: '' }]), {
					status: 200
				})
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
			playbookItems: unknown[];
			skillItems: unknown[];
			kbs: unknown[];
			matters: unknown[];
		};
		expect(out.autonomousEnabled).toBe(true);
		expect(out.playbookItems).toHaveLength(1);
		expect(out.skillItems).toHaveLength(2);
		expect(out.kbs).toHaveLength(1);
		expect(out.matters).toHaveLength(1);
	});

	it('degrades libraries to [] on non-ok and reflects opt-in false', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
			)
			.mockResolvedValueOnce(new Response('err', { status: 500 }))
			.mockResolvedValueOnce(new Response('err', { status: 500 }))
			.mockResolvedValueOnce(new Response('err', { status: 500 }))
			.mockResolvedValueOnce(new Response('err', { status: 500 }))
			.mockResolvedValueOnce(new Response('err', { status: 500 }));
		const out = (await load({} as never)) as {
			autonomousEnabled: boolean;
			playbookItems: unknown[];
			kbs: unknown[];
		};
		expect(out.autonomousEnabled).toBe(false);
		expect(out.playbookItems).toEqual([]);
		expect(out.kbs).toEqual([]);
	});
});

describe('/automations/new run action', () => {
	it('POSTs run-now and redirects to the new session receipt', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sess-9' }), { status: 201 }));
		await expect(
			actions.run(
				formEvent({
					source_mode: 'playbook',
					playbook_id: 'p1',
					target_kb_id: 'kb1',
					max_cost_usd: '2.00'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/automations/sess-9' });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/run-now');
		expect(body).toEqual({
			playbook_id: 'p1',
			target_kb_id: 'kb1',
			max_cost_usd: '2.00',
			emit_artifacts: false
		});
	});
	it('sends skill_ref when source_mode=skill', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's2' }), { status: 201 }));
		await expect(
			actions.run(formEvent({ source_mode: 'skill', skill_ref: 'comms', target_kb_id: 'kb1' }))
		).rejects.toMatchObject({ status: 303 });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			skill_ref: 'comms',
			target_kb_id: 'kb1',
			emit_artifacts: false
		});
	});
	it('fails 400 when neither source nor KB is present', async () => {
		const out = await actions.run(formEvent({ source_mode: 'playbook' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('redirects to /automations on a 403 (not opted in)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
		await expect(
			actions.run(formEvent({ source_mode: 'playbook', playbook_id: 'p1', target_kb_id: 'kb1' }))
		).rejects.toMatchObject({ status: 303, location: '/automations' });
	});
	it('fails with a form error on a 422', async () => {
		lqFetch.mockResolvedValueOnce(new Response('bad', { status: 422 }));
		const out = await actions.run(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', target_kb_id: 'kb1' })
		);
		expect(out).toMatchObject({ status: 422 });
	});
	it('fails 502 when run-now returns no id', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 201 }));
		const out = await actions.run(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', target_kb_id: 'kb1' })
		);
		expect(out).toMatchObject({ status: 502 });
	});
});
