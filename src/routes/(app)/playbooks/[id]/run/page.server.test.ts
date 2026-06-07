// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = (over: Record<string, unknown> = {}) =>
	({
		params: { id: 'pb1' },
		url: new URL('http://x/playbooks/pb1/run'),
		locals: { user: { is_admin: true } },
		...over
	}) as never;
const evMatter = (matter: string) =>
	({
		params: { id: 'pb1' },
		url: new URL(`http://x/playbooks/pb1/run?matter=${matter}`),
		locals: { user: { is_admin: true } }
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id]/run load', () => {
	it('throws 403 for a non-admin', async () => {
		await expect(
			load({
				params: { id: 'pb1' },
				url: new URL('http://x/playbooks/pb1/run'),
				locals: { user: { is_admin: false } }
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});
	it('loads the playbook and the user matters', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA' }), {
					status: 200
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			);
		const out = (await load(ev())) as {
			playbook: { id: string };
			matters: { id: string }[];
			matterFiles: unknown[];
			execution: unknown;
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
		expect(out.playbook.id).toBe('pb1');
		expect(out.matters[0].id).toBe('m1');
		expect(out.matterFiles).toEqual([]);
		expect(out.execution).toBeNull();
	});
	it('throws 404 when the playbook is missing', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 404 });
	});
	it('returns only ingested files for ?matter', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA' }), {
					status: 200
				})
			) // playbook
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			) // matters
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'm1', name: 'Acme', attached_file_ids: ['f1', 'f2'] }), {
					status: 200
				})
			) // project
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f1',
						filename: 'a.pdf',
						ingestion_status: 'ready',
						document_id: 'd1'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f2',
						filename: 'b.docx',
						ingestion_status: 'failed',
						document_id: null
					}),
					{ status: 200 }
				)
			);
		const out = (await load(evMatter('m1'))) as { matterFiles: { id: string }[] };
		expect(out.matterFiles.map((f) => f.id)).toEqual(['f1']);
	});
});
