// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
const ev = (id = 's1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
/** Queue the findings+memories responses that follow the session response. */
function mockOutput(
	findingsBody: unknown = { findings: [], total_count: 0 },
	memoriesBody: unknown = { entries: [], total_count: 0 }
) {
	lqFetch.mockResolvedValueOnce(okJson(findingsBody)).mockResolvedValueOnce(okJson(memoriesBody));
}

describe('/automations/[id] load', () => {
	it('returns the parsed session summary and receipt', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					session: {
						id: 's1',
						status: 'completed',
						trigger_kind: 'schedule',
						current_phase: 'delivery',
						cost_total_usd: '0.42',
						created_at: 'x'
					},
					receipt: {
						session_id: 's1',
						trigger_kind: 'schedule',
						status: 'completed',
						cost_total_usd: '0.42',
						phase_transitions: [],
						tool_calls: [],
						terminal_reason: 'completed'
					}
				}),
				{ status: 200 }
			)
		);
		mockOutput();
		const out = (await load(ev())) as {
			session: { id: string };
			receipt: { terminal_reason: string } | null;
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/autonomous/sessions/s1/findings?limit=200');
		expect(lqFetch.mock.calls[2][1]).toBe(
			'/api/v1/autonomous/memory?source_session_id=s1&limit=200'
		);
		expect(out.session.id).toBe('s1');
		expect(out.receipt?.terminal_reason).toBe('completed');
	});
	it('passes a null receipt through (build failure) without erroring', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					session: {
						id: 's1',
						status: 'failed',
						trigger_kind: 'manual',
						current_phase: 'intake',
						cost_total_usd: '0',
						created_at: 'x',
						error: 'boom'
					},
					receipt: null
				}),
				{ status: 200 }
			)
		);
		mockOutput();
		const out = (await load(ev())) as { session: { error: string | null }; receipt: unknown };
		expect(out.receipt).toBeNull();
		expect(out.session.error).toBe('boom');
	});
	it('throws 404 for a missing/cross-user session', async () => {
		lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
		lqFetch.mockResolvedValue(new Response('x', { status: 404 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 404 });
	});
	it('returns parsed findings, total, and memories', async () => {
		lqFetch.mockResolvedValueOnce(
			okJson({
				session: {
					id: 's1',
					status: 'completed',
					trigger_kind: 'manual',
					current_phase: 'delivery',
					cost_total_usd: '0',
					created_at: 'x'
				},
				receipt: null
			})
		);
		mockOutput(
			{
				findings: [{ id: 'f1', severity: 'critical', title: 'T', content: 'C', created_at: 'x' }],
				total_count: 5
			},
			{ entries: [{ id: 'm1', state: 'kept', category: 'pref', content: 'M', created_at: 'y' }] }
		);
		const out = (await load(ev())) as {
			findings: unknown[];
			findings_total: number;
			memories: unknown[];
		};
		expect(out.findings).toHaveLength(1);
		expect(out.findings_total).toBe(5);
		expect(out.memories).toHaveLength(1);
	});
	it('degrades findings/memories failures to null without failing the page', async () => {
		lqFetch.mockResolvedValueOnce(
			okJson({
				session: {
					id: 's1',
					status: 'completed',
					trigger_kind: 'manual',
					current_phase: 'delivery',
					cost_total_usd: '0',
					created_at: 'x'
				},
				receipt: null
			})
		);
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = (await load(ev())) as { findings: null; memories: null };
		expect(out.findings).toBeNull();
		expect(out.memories).toBeNull();
	});
});
