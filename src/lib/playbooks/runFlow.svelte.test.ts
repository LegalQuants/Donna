import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunFlow } from './runFlow.svelte';

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('createRunFlow', () => {
  it('runs the pick path: execute → poll → done with results', async () => {
    const completed = {
      id: 'e1', status: 'completed',
      results: { schema_version: 'm3-a2-v1', summary: { matches_standard: 1, matches_fallback: 0, deviates: 0, missing: 0 }, positions: [] }
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202)) // POST execute
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'running' }))       // poll 1
      .mockResolvedValueOnce(jsonResp(completed));                            // poll 2
    vi.stubGlobal('fetch', fetchMock);

    const flow = createRunFlow('pb1', { pollMs: 10 });
    const done = flow.runWithDocument('d1');
    await vi.advanceTimersByTimeAsync(50);
    await done;

    expect(fetchMock.mock.calls[0][0]).toBe('/playbooks/pb1/execute');
    expect(fetchMock.mock.calls[1][0]).toBe('/playbook-executions/e1');
    expect(flow.phase).toBe('done');
    expect(flow.results?.summary.matches_standard).toBe(1);
  });

  it('surfaces a backend execution error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202))
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'error', error: 'boom' }));
    vi.stubGlobal('fetch', fetchMock);
    const flow = createRunFlow('pb1', { pollMs: 10 });
    const done = flow.runWithDocument('d1');
    await vi.advanceTimersByTimeAsync(30);
    await done;
    expect(flow.phase).toBe('error');
    expect(flow.error).toMatch(/boom/);
  });

  it('runs the upload path: upload → ingest poll → execute → poll → done', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201))                                  // POST /files
      .mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'processing', document_id: null })) // poll files
      .mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'ready', document_id: 'd1' }))       // poll files ready
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202))               // POST execute
      .mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'completed', results: { schema_version: 'm3-a2-v1', summary: { matches_standard: 0, matches_fallback: 0, deviates: 0, missing: 0 }, positions: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const flow = createRunFlow('pb1', { pollMs: 10 });
    const file = new File([new Uint8Array([1])], 'c.pdf', { type: 'application/pdf' });
    const done = flow.runWithUpload(file);
    await vi.advanceTimersByTimeAsync(80);
    await done;
    expect(fetchMock.mock.calls[0][0]).toBe('/files');
    expect(flow.phase).toBe('done');
  });

  it('errors when ingestion fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201))
      .mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'failed', ingestion_error: 'unsupported_type', document_id: null }));
    vi.stubGlobal('fetch', fetchMock);
    const flow = createRunFlow('pb1', { pollMs: 10 });
    const done = flow.runWithUpload(new File([new Uint8Array([1])], 'c.docx'));
    await vi.advanceTimersByTimeAsync(30);
    await done;
    expect(flow.phase).toBe('error');
    expect(flow.error).toMatch(/unsupported_type/);
  });
});
