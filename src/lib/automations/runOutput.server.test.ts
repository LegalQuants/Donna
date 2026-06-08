// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { loadRunOutput } from './runOutput.server';
const ev = {} as never;
beforeEach(() => lqFetch.mockReset());

const findingsBody = {
	findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }],
	total_count: 1
};
const memoriesBody = {
	entries: [{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'y' }],
	total_count: 1
};

describe('loadRunOutput', () => {
	it('fetches findings + memories + artifacts in parallel and returns parsed output', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1/findings?limit=200');
		expect(lqFetch.mock.calls[1][1]).toBe(
			'/api/v1/autonomous/memory?source_session_id=s1&limit=200'
		);
		expect(out.findings).toHaveLength(1);
		expect(out.findings_total).toBe(1);
		expect(out.memories).toHaveLength(1);
		expect(out.memories_total).toBe(1);
	});
	it('degrades a failed findings fetch to null without touching memories', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response('boom', { status: 500 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.findings).toBeNull();
		expect(out.findings_total).toBeNull();
		expect(out.memories).toHaveLength(1);
	});
	it('degrades a failed memories fetch to null without touching findings', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 502 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.findings).toHaveLength(1);
		expect(out.memories).toBeNull();
		expect(out.memories_total).toBeNull();
	});
	it('degrades non-JSON bodies to null', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
			.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.findings).toBeNull();
		expect(out.memories).toBeNull();
	});
});

const artifactsBody = {
	artifacts: [
		{
			id: 'a1',
			name: 'Memo.md',
			mime: 'text/markdown',
			size_bytes: 100,
			file_id: 'f9',
			document_id: 'd9',
			created_at: 'z'
		}
	],
	total_count: 1
};

describe('loadRunOutput artifacts', () => {
	it('fetches artifacts in the same parallel batch and returns parsed refs', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(artifactsBody), { status: 200 }));
		const out = await loadRunOutput(ev, 's1');
		expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/autonomous/sessions/s1/artifacts?limit=200');
		expect(out.artifacts).toHaveLength(1);
		expect(out.artifacts?.[0].name).toBe('Memo.md');
		expect(out.artifacts_total).toBe(1);
	});
	it('degrades a failed artifacts fetch to null without touching findings/memories', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.artifacts).toBeNull();
		expect(out.artifacts_total).toBeNull();
		expect(out.findings).toHaveLength(1);
		expect(out.memories).toHaveLength(1);
	});
	it('degrades a non-JSON artifacts body to null', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.artifacts).toBeNull();
	});
});
