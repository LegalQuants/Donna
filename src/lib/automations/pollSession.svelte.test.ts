import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionPoll } from './pollSession.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function mockFetchSequence(statuses: string[]) {
	let i = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			const status = statuses[Math.min(i, statuses.length - 1)];
			i++;
			return new Response(
				JSON.stringify({
					session: {
						id: 's1',
						status,
						trigger_kind: 'manual',
						current_phase: 'analysis',
						cost_total_usd: '0.1',
						created_at: 'x'
					},
					receipt: {
						session_id: 's1',
						trigger_kind: 'manual',
						status,
						phase_transitions: [],
						tool_calls: []
					},
					findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }],
					findings_total: 1,
					memories: [],
					memories_total: 0
				}),
				{ status: 200 }
			);
		})
	);
}

/** Drive each tick with a fully-custom payload. The last entry is repeated for
 *  any ticks beyond the array length (same semantics as mockFetchSequence). */
function mockFetchPayloads(payloads: Record<string, unknown>[]) {
	let i = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			const payload = payloads[Math.min(i, payloads.length - 1)];
			i++;
			return new Response(JSON.stringify(payload), { status: 200 });
		})
	);
}

function fetchCalls(): number {
	return (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe('createSessionPoll', () => {
	it('stops polling once the session reaches a terminal status', async () => {
		mockFetchSequence(['running', 'running', 'completed']);
		const poll = createSessionPoll('s1', { pollMs: 1000 });
		poll.start();
		await vi.advanceTimersByTimeAsync(3000);
		expect(poll.session?.status).toBe('completed');
		expect(poll.done).toBe(true);
		expect(poll.error).toBeNull();
		const callsAtStop = fetchCalls();
		expect(callsAtStop).toBe(3); // tick at t=0, 1000, 2000 → terminal
		await vi.advanceTimersByTimeAsync(3000);
		expect(fetchCalls()).toBe(callsAtStop); // no further polling
	});

	it('does not mark done when stopped before a terminal status', async () => {
		mockFetchSequence(['running']); // never terminal
		const poll = createSessionPoll('s1', { pollMs: 1000 });
		poll.start();
		await vi.advanceTimersByTimeAsync(1500);
		poll.stop();
		await vi.advanceTimersByTimeAsync(2000); // let the in-flight sleep resolve and the loop exit
		expect(poll.session?.status).toBe('running');
		expect(poll.done).toBe(false);
		expect(poll.error).toBeNull();
	});

	it('exposes findings, findingsTotal, memories, and memoriesTotal from the widened payload', async () => {
		mockFetchSequence(['completed']);
		const poll = createSessionPoll('s1', { pollMs: 1000 });
		poll.start();
		await vi.advanceTimersByTimeAsync(100);
		expect(poll.findings).toHaveLength(1);
		expect(poll.findings?.[0].id).toBe('f1');
		expect(poll.findingsTotal).toBe(1);
		expect(poll.memories).toEqual([]);
		expect(poll.memoriesTotal).toBe(0);
	});

	it('retains last-known-good findings/memories when a later tick returns nulls (degraded payload)', async () => {
		const tick1 = {
			session: {
				id: 's1',
				status: 'running',
				trigger_kind: 'manual',
				current_phase: 'analysis',
				cost_total_usd: '0.1',
				created_at: 'x'
			},
			receipt: null,
			findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }],
			findings_total: 3,
			memories: [{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'x' }],
			memories_total: 5
		};
		// tick 2: session still running, but findings/memories degrade to null
		const tick2 = {
			session: {
				id: 's1',
				status: 'running',
				trigger_kind: 'manual',
				current_phase: 'analysis',
				cost_total_usd: '0.1',
				created_at: 'x'
			},
			receipt: null,
			findings: null,
			findings_total: null,
			memories: null,
			memories_total: null
		};
		// tick 3: terminal so polling stops
		const tick3 = {
			session: {
				id: 's1',
				status: 'completed',
				trigger_kind: 'manual',
				current_phase: 'delivery',
				cost_total_usd: '0.2',
				created_at: 'x'
			},
			receipt: null,
			findings: null,
			findings_total: null,
			memories: null,
			memories_total: null
		};
		mockFetchPayloads([tick1, tick2, tick3]);
		const poll = createSessionPoll('s1', { pollMs: 500 });
		poll.start();
		// after tick 1
		await vi.advanceTimersByTimeAsync(100);
		expect(poll.findings).toHaveLength(1);
		expect(poll.findingsTotal).toBe(3);
		expect(poll.memories).toHaveLength(1);
		expect(poll.memoriesTotal).toBe(5);
		// after tick 2 (degraded: nulls incoming)
		await vi.advanceTimersByTimeAsync(500);
		expect(poll.findings).toHaveLength(1);
		expect(poll.findings?.[0].id).toBe('f1');
		expect(poll.findingsTotal).toBe(3);
		expect(poll.memories).toHaveLength(1);
		expect(poll.memories?.[0].id).toBe('m1');
		expect(poll.memoriesTotal).toBe(5);
	});

	it('replaces findings/memories when tick 2 brings new non-null values', async () => {
		const tick1 = {
			session: {
				id: 's1',
				status: 'running',
				trigger_kind: 'manual',
				current_phase: 'analysis',
				cost_total_usd: '0.1',
				created_at: 'x'
			},
			receipt: null,
			findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }],
			findings_total: 1,
			memories: [{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'x' }],
			memories_total: 1
		};
		const tick2 = {
			session: {
				id: 's1',
				status: 'completed',
				trigger_kind: 'manual',
				current_phase: 'delivery',
				cost_total_usd: '0.2',
				created_at: 'x'
			},
			receipt: null,
			findings: [
				{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' },
				{ id: 'f2', severity: 'critical', title: 'T2', content: 'C2', created_at: 'x' }
			],
			findings_total: 2,
			memories: [
				{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'x' },
				{ id: 'm2', state: 'proposed', category: 'risk', content: 'N', created_at: 'x' }
			],
			memories_total: 2
		};
		mockFetchPayloads([tick1, tick2]);
		const poll = createSessionPoll('s1', { pollMs: 500 });
		poll.start();
		// after tick 1
		await vi.advanceTimersByTimeAsync(100);
		expect(poll.findings).toHaveLength(1);
		expect(poll.memoriesTotal).toBe(1);
		// after tick 2 (new non-null values)
		await vi.advanceTimersByTimeAsync(500);
		expect(poll.findings).toHaveLength(2);
		expect(poll.findings?.[1].id).toBe('f2');
		expect(poll.findingsTotal).toBe(2);
		expect(poll.memories).toHaveLength(2);
		expect(poll.memories?.[1].id).toBe('m2');
		expect(poll.memoriesTotal).toBe(2);
	});
});
