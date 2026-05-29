// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions } from './+page.server';

const fileEvent = (files: { name: string; bytes: Uint8Array }[], id = 'k1') => {
  const fd = new FormData();
  for (const f of files) fd.append('file', new File([f.bytes as BlobPart], f.name, { type: 'application/pdf' }));
  return { params: { id }, request: new Request('http://x', { method: 'POST', body: fd }) } as never;
};

beforeEach(() => lqFetch.mockReset());

describe('/knowledge/[id] actions — uploadFile', () => {
  it('POSTs each blob to /api/v1/files as multipart and returns { uploaded: PendingUpload[] }', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', size_bytes: 11, ingestion_status: 'pending' }), { status: 201 }));
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f2', filename: 'b.pdf', size_bytes: 22, ingestion_status: 'pending' }), { status: 201 }));
    const r = (await actions.uploadFile(fileEvent([
      { name: 'a.pdf', bytes: new Uint8Array(11) },
      { name: 'b.pdf', bytes: new Uint8Array(22) }
    ]))) as { uploaded: { file_id: string; filename: string; size_bytes: number; status: string }[] };
    expect(lqFetch).toHaveBeenCalledTimes(2);
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
    expect(lqFetch.mock.calls[0][2].method).toBe('POST');
    expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData);
    expect(r.uploaded).toEqual([
      { file_id: 'f1', filename: 'a.pdf', size_bytes: 11, status: 'pending' },
      { file_id: 'f2', filename: 'b.pdf', size_bytes: 22, status: 'pending' }
    ]);
  });

  it('skips empty file slots (size 0) without calling the backend', async () => {
    const fd = new FormData();
    fd.append('file', new File([], 'empty.pdf'));
    const r = await actions.uploadFile({ params: { id: 'k1' }, request: new Request('http://x', { method: 'POST', body: fd }) } as never);
    expect(lqFetch).not.toHaveBeenCalled();
    expect(r).toEqual({ uploaded: [] });
  });

  it('maps a 413 to a per-file size-limit fail with the backend-reported MB cap', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ details: { limit_bytes: 100 * 1024 * 1024 } }), { status: 413 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'big.pdf', bytes: new Uint8Array(11) }]));
    expect(r).toMatchObject({ status: 413, data: { error: 'File "big.pdf" is too large — max 100 MB.' } });
  });

  it('falls back to a default 100 MB cap when the 413 body is malformed', async () => {
    lqFetch.mockResolvedValueOnce(new Response('not-json', { status: 413 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'big.pdf', bytes: new Uint8Array(11) }]));
    expect(r).toMatchObject({ status: 413, data: { error: 'File "big.pdf" is too large — max 100 MB.' } });
  });

  it('maps any other backend failure to a generic 502 with the filename', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', bytes: new Uint8Array(11) }]));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not upload "a.pdf".' } });
  });

  it('bails on the first failure and does not attempt subsequent blobs', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.uploadFile(fileEvent([
      { name: 'a.pdf', bytes: new Uint8Array(11) },
      { name: 'b.pdf', bytes: new Uint8Array(22) }
    ]));
    expect(lqFetch).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ status: 502 });
  });
});

const urlEv = (fields: Record<string, string>, id = 'k1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;

describe('/knowledge/[id] actions — attachFile', () => {
  it('POSTs { file_id } to /knowledge-bases/{kb_id}/files and returns success on 204', async () => {
    lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1/files');
    expect(lqFetch.mock.calls[0][2].method).toBe('POST');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ file_id: 'f1' });
    expect(r).toMatchObject({ success: true });
  });

  it('treats 409 (already attached) as success — race protection', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ success: true });
  });

  it('returns fail(422, { retry: true }) when the file is not ready (race)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 422 }));
    const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ status: 422, data: { retry: true } });
  });

  it('returns fail(404) when the KB or file is missing', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ status: 404, data: { error: 'Knowledge base or file no longer exists.' } });
  });

  it('returns fail(502) for other backend failures', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not attach the file.' } });
  });

  it('returns fail(400) when file_id is missing without calling the backend', async () => {
    const r = await actions.attachFile(urlEv({}));
    expect(r).toMatchObject({ status: 400, data: { error: 'Missing file_id.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });
});

describe('/knowledge/[id] actions — detachFile', () => {
  it('DELETEs /knowledge-bases/{kb_id}/files/{file_id} and returns success on 204', async () => {
    lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1/files/f1');
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
    expect(r).toMatchObject({ success: true });
  });

  it('treats 404 (not attached) as success — idempotent', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ success: true });
  });

  it('returns fail(502) for other backend failures', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not remove the file.' } });
  });

  it('returns fail(400) when file_id is missing without calling the backend', async () => {
    const r = await actions.detachFile(urlEv({}));
    expect(r).toMatchObject({ status: 400, data: { error: 'Missing file_id.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });
});
