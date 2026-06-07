import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGenFlow } from './genFlow.svelte';

const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const completedDraft = {
	id: 'g1',
	status: 'completed',
	draft_playbook: {
		name: 'Generated NDA Playbook',
		contract_type: 'NDA',
		version: '1.0.0',
		description: 'd',
		positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }]
	}
};

describe('createGenFlow', () => {
	it('matter-only path: generate → poll → review with draft', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
			.mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'running' }))
			.mockResolvedValueOnce(jsonResp(completedDraft));
		vi.stubGlobal('fetch', fetchMock);
		const flow = createGenFlow({ pollMs: 10 });
		const done = flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
		await vi.advanceTimersByTimeAsync(50);
		await done;
		expect(fetchMock.mock.calls[0][0]).toBe('/playbooks/easy');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).document_ids).toEqual(['d1']);
		expect(flow.phase).toBe('review');
		expect(flow.draft?.positions?.length).toBe(1);
	});

	it('upload path: upload → ingest poll → generate → poll → review', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201))
			.mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'ready', document_id: 'd9' }))
			.mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
			.mockResolvedValueOnce(jsonResp(completedDraft));
		vi.stubGlobal('fetch', fetchMock);
		const flow = createGenFlow({ pollMs: 10 });
		const file = new File([new Uint8Array([1])], 'c.pdf', { type: 'application/pdf' });
		const done = flow.generate([{ kind: 'upload', file }], 'NDA');
		await vi.advanceTimersByTimeAsync(60);
		await done;
		expect(fetchMock.mock.calls[0][0]).toBe('/files');
		expect(JSON.parse(fetchMock.mock.calls[2][1].body).document_ids).toEqual(['d9']);
		expect(flow.phase).toBe('review');
	});

	it('surfaces a generation error', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
			.mockResolvedValueOnce(
				jsonResp({ id: 'g1', status: 'error', error_message: 'extraction failed' })
			);
		vi.stubGlobal('fetch', fetchMock);
		const flow = createGenFlow({ pollMs: 10 });
		const done = flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
		await vi.advanceTimersByTimeAsync(30);
		await done;
		expect(flow.phase).toBe('error');
		expect(flow.error).toMatch(/extraction failed/);
	});

	it('flags stuck after the threshold while still polling', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
			.mockImplementation(() => Promise.resolve(jsonResp({ id: 'g1', status: 'running' })));
		vi.stubGlobal('fetch', fetchMock);
		const flow = createGenFlow({ pollMs: 10, stuckMs: 30 });
		flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
		await vi.advanceTimersByTimeAsync(60);
		expect(flow.stuck).toBe(true);
		expect(flow.phase).toBe('generating');
	});
});
