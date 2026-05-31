// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const loadEv = (search = '') => ({ url: new URL(`http://x/playbooks/new${search}`) }) as never;
const saveEv = (draft: unknown) => {
  const body = new URLSearchParams(); body.append('draft', JSON.stringify(draft));
  return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/new load', () => {
  it('returns the user matters', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 }));
    const out = (await load(loadEv())) as { matters: { id: string }[]; matterFiles: unknown[]; generation: unknown };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(out.matters[0].id).toBe('m1');
    expect(out.matterFiles).toEqual([]);
    expect(out.generation).toBeNull();
  });
  it('returns only ingested files for ?matter', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1', attached_file_ids: ['f1', 'f2'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', ingestion_status: 'ready', document_id: 'd1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f2', filename: 'b.pdf', ingestion_status: 'processing', document_id: null }), { status: 200 }));
    const out = (await load(loadEv('?matter=m1'))) as { matterFiles: { id: string }[] };
    expect(out.matterFiles.map((f) => f.id)).toEqual(['f1']);
  });
});

describe('/playbooks/new ?/save', () => {
  it('POSTs the draft to /playbooks and redirects to the new playbook', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb9' }), { status: 201 }));
    const draft = { name: 'My NDA', contract_type: 'NDA', version: '1.0.0', description: 'd', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    await expect(actions.save(saveEv(draft))).rejects.toMatchObject({ status: 303, location: '/playbooks/pb9' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).name).toBe('My NDA');
  });
  it('fails with a message when the draft has no positions', async () => {
    const r = await actions.save(saveEv({ name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [] }));
    expect(r).toMatchObject({ status: 400 });
  });
  it('maps a 422 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'bad' }), { status: 422 }));
    const draft = { name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    const r = await actions.save(saveEv(draft));
    expect(r).toMatchObject({ status: 422 });
  });
});
