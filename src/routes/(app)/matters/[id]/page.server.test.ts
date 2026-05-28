// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ev = (fields: Record<string, string> = {}, id = 'p1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;
const loadEv = (id = 'p1') => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters/[id] load', () => {
  it('loads the matter and its chats', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Acme', description: 'd', privileged: false, minimum_inference_tier: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'c1', title: 'Chat 1', message_count: 3 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const out = (await load(loadEv())) as { matter: { name: string }; chats: unknown[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/chats?project_id=p1');
    expect(out.matter.name).toBe('Acme');
    expect(out.chats).toHaveLength(1);
  });
});

describe('/matters/[id] actions', () => {
  it('rename rejects an empty name without calling the backend', async () => {
    const r = await actions.rename(ev({ name: '  ' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('rename PATCHes name + description + privileged=false + null tier when neither is set', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.rename(ev({ name: 'Renamed', description: 'x' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Renamed', description: 'x', privileged: false, minimum_inference_tier: null });
    expect(r).toMatchObject({ success: true });
  });

  it('rename PATCHes privileged=true + numeric tier when both are set', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.rename(ev({ name: 'Renamed', description: 'x', privileged: 'on', minimum_inference_tier: '4' }));
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Renamed', description: 'x', privileged: true, minimum_inference_tier: 4 });
    expect(r).toMatchObject({ success: true });
  });

  it('rename pre-checks privileged-without-tier without calling the backend', async () => {
    const r = await actions.rename(ev({ name: 'Renamed', privileged: 'on' }));
    expect(r).toMatchObject({ status: 400, data: { error: 'Privileged matters require a minimum tier.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('rename maps a backend 400 to the privilege error message', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 400 }));
    const r = await actions.rename(ev({ name: 'Renamed', privileged: 'on', minimum_inference_tier: '4' }));
    expect(r).toMatchObject({ status: 400, data: { error: 'Privileged matters require a minimum tier.' } });
  });

  it('rename maps other backend failures to the generic rename error', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const r = await actions.rename(ev({ name: 'Renamed' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not rename the matter.' } });
  });

  it('archive DELETEs and redirects to /matters', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(actions.archive(ev())).rejects.toMatchObject({ status: 303, location: '/matters' });
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });

  it('newChat POSTs a project-scoped chat and redirects to it', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chatX' }), { status: 201 }));
    await expect(actions.newChat(ev())).rejects.toMatchObject({ status: 303, location: '/chats/chatX' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
  });
});

describe('/matters/[id] load — files + KBs', () => {
  it('fans out file metadata for each attached_file_id and filters out 404s', async () => {
    const matter = { id: 'p1', name: 'Acme', description: 'd', privileged: false, minimum_inference_tier: null, attached_file_ids: ['a', 'b', 'gone'] };
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))                                      // GET /projects/p1
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))                                // GET /chats?project_id=p1
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a', filename: 'a.pdf', size_bytes: 1, mime_type: 'application/pdf', ingestion_status: 'ready' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'b', filename: 'b.pdf', size_bytes: 2, mime_type: 'application/pdf', ingestion_status: 'pending' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))                                                 // GET /files/gone → filtered
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))                                          // GET /knowledge-bases?project_id=p1
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'k1', name: 'KB', owner_id: 'u', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '', updated_at: '' }]), { status: 200 })); // GET /knowledge-bases
    const out = (await load(loadEv())) as { files: { id: string }[]; kbs: { linked: unknown[]; available: { id: string }[] } };
    expect(out.files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(out.kbs.linked).toEqual([]);
    expect(out.kbs.available.map((k) => k.id)).toEqual(['k1']);
  });

  it('subtracts linked KBs from the available picker list', async () => {
    const matter = { id: 'p1', name: 'Acme', privileged: false, minimum_inference_tier: null, attached_file_ids: [] };
    const linkedKb = { id: 'k1', name: 'Linked', owner_id: 'u', hybrid_alpha: 0.5, file_count: 1, chunk_count: 1, created_at: '', updated_at: '' };
    const otherKb = { id: 'k2', name: 'Other', owner_id: 'u', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '', updated_at: '' };
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([linkedKb]), { status: 200 }))                                  // linked
      .mockResolvedValueOnce(new Response(JSON.stringify([linkedKb, otherKb]), { status: 200 }));                        // all
    const out = (await load(loadEv())) as { kbs: { linked: { id: string }[]; available: { id: string }[] } };
    expect(out.kbs.linked.map((k) => k.id)).toEqual(['k1']);
    expect(out.kbs.available.map((k) => k.id)).toEqual(['k2']);
  });

  it('degrades gracefully when KB fetches fail (returns empty arrays)', async () => {
    const matter = { id: 'p1', name: 'Acme', privileged: false, minimum_inference_tier: null, attached_file_ids: [] };
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const out = (await load(loadEv())) as { kbs: { linked: unknown[]; available: unknown[] } };
    expect(out.kbs.linked).toEqual([]);
    expect(out.kbs.available).toEqual([]);
  });
});

const fileEvent = (files: { name: string; type: string; bytes?: number }[], id = 'p1') => {
  const fd = new FormData();
  for (const f of files) {
    fd.append('file', new File([new Uint8Array(f.bytes ?? 8)], f.name, { type: f.type }));
  }
  return { params: { id }, request: new Request('http://x', { method: 'POST', body: fd }) } as never;
};
const detachEvent = (file_id: string, id = 'p1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ file_id }) }) }) as never;

describe('/matters/[id] uploadFile action', () => {
  it('uploads one file then attaches it; redirects via { uploaded: 1 }', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'newfile1' }), { status: 201 })) // POST /files
      .mockResolvedValueOnce(new Response(null, { status: 204 }));                              // POST /projects/p1/files
    const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', type: 'application/pdf' }]));
    expect(r).toEqual({ uploaded: 1 });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
    expect(lqFetch.mock.calls[0][2].method).toBe('POST');
    expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData);
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/projects/p1/files');
    expect(JSON.parse(lqFetch.mock.calls[1][2].body)).toEqual({ file_id: 'newfile1' });
  });

  it('uploads multiple files in order', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f2' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const r = await actions.uploadFile(fileEvent([
      { name: 'a.pdf', type: 'application/pdf' },
      { name: 'b.pdf', type: 'application/pdf' }
    ]));
    expect(r).toEqual({ uploaded: 2 });
    expect(JSON.parse(lqFetch.mock.calls[1][2].body)).toEqual({ file_id: 'f1' });
    expect(JSON.parse(lqFetch.mock.calls[3][2].body)).toEqual({ file_id: 'f2' });
  });

  it('returns 413 with the formatted MB limit when the backend returns 413 on upload', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ details: { limit_bytes: 100 * 1024 * 1024, received_bytes: 200 * 1024 * 1024 } }), { status: 413 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'huge.pdf', type: 'application/pdf' }]));
    expect(r).toMatchObject({ status: 413, data: { error: 'File "huge.pdf" is too large — max 100 MB.' } });
  });

  it('falls back to "max 100 MB" when the 413 body is unparseable', async () => {
    lqFetch.mockResolvedValueOnce(new Response('garbage', { status: 413 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'huge.pdf', type: 'application/pdf' }]));
    expect(r).toMatchObject({ status: 413, data: { error: 'File "huge.pdf" is too large — max 100 MB.' } });
  });

  it('returns 502 with the failing filename when the backend errors mid-batch (file 2 fails on upload)', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 })) // file 1 upload
      .mockResolvedValueOnce(new Response(null, { status: 204 }))                          // file 1 attach
      .mockResolvedValueOnce(new Response('oops', { status: 500 }));                       // file 2 upload fails
    const r = await actions.uploadFile(fileEvent([
      { name: 'ok.pdf', type: 'application/pdf' },
      { name: 'bad.pdf', type: 'application/pdf' }
    ]));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not upload "bad.pdf".' } });
  });

  it('silently treats 409 on the attach step as success', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', type: 'application/pdf' }]));
    expect(r).toEqual({ uploaded: 1 });
  });
});

describe('/matters/[id] detachFile action', () => {
  it('DELETEs the project-file join and returns success', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await actions.detachFile(detachEvent('f1'));
    expect(r).toEqual({ success: true });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1/files/f1');
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });

  it('treats 404 as silent success (idempotent from the UI POV)', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    const r = await actions.detachFile(detachEvent('f1'));
    expect(r).toEqual({ success: true });
  });

  it('returns 502 on other backend failures', async () => {
    lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await actions.detachFile(detachEvent('f1'));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not remove the file.' } });
  });
});

const kbEvent = (kb_id: string, id = 'p1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ kb_id }) }) }) as never;

describe('/matters/[id] linkKb / unlinkKb actions', () => {
  it('linkKb PATCHes the KB with the matter id', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.linkKb(kbEvent('k1'));
    expect(r).toEqual({ success: true });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
  });

  it('linkKb maps 404 to a friendly error', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    const r = await actions.linkKb(kbEvent('k1'));
    expect(r).toMatchObject({ status: 404, data: { error: 'Knowledge base no longer exists.' } });
  });

  it('linkKb maps other failures to a 502', async () => {
    lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await actions.linkKb(kbEvent('k1'));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not link the knowledge base.' } });
  });

  it('unlinkKb PATCHes the KB with project_id: null', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.unlinkKb(kbEvent('k1'));
    expect(r).toEqual({ success: true });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: null });
  });

  it('unlinkKb treats 404 as silent success', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    const r = await actions.unlinkKb(kbEvent('k1'));
    expect(r).toEqual({ success: true });
  });

  it('unlinkKb maps other failures to a 502', async () => {
    lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await actions.unlinkKb(kbEvent('k1'));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not unlink the knowledge base.' } });
  });
});
