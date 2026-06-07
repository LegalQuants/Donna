// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = (matter?: string) =>
	({ url: new URL(`http://x/tabular/new${matter ? `?matter=${matter}` : ''}`) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular/new load', () => {
	it('returns matters, no matterFiles, and table skills (filtered) without ?matter=', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify([
						{
							name: 'contract-snapshot',
							title: 'Contract Snapshot',
							description: 'Key terms',
							output_format: 'table'
						},
						{ name: 'comms-improver', title: 'Comms Improver', output_format: 'report' }
					]),
					{ status: 200 }
				)
			);
		const out = (await load(ev())) as {
			matters: { id: string }[];
			matterFiles: unknown[];
			tableSkills: { name: string }[];
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/skills');
		expect(out.matters).toEqual([{ id: 'm1', name: 'Acme' }]);
		expect(out.matterFiles).toEqual([]);
		expect(out.tableSkills).toEqual([
			{ name: 'contract-snapshot', title: 'Contract Snapshot', description: 'Key terms' }
		]);
	});

	it('resolves ready matter files (only ready + with document_id) when ?matter= is set', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ attached_file_ids: ['f1', 'f2', 'f3'] }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f1',
						filename: 'a.pdf',
						ingestion_status: 'ready',
						document_id: 'doc1'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f2',
						filename: 'b.pdf',
						ingestion_status: 'processing',
						document_id: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f3',
						filename: 'c.pdf',
						ingestion_status: 'ready',
						document_id: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
		const out = (await load(ev('m1'))) as {
			matterFiles: { document_id: string; name: string }[];
			tableSkills: unknown[];
		};
		expect(out.matterFiles).toEqual([{ document_id: 'doc1', name: 'a.pdf' }]);
		expect(out.tableSkills).toEqual([]);
	});

	it('returns an empty tableSkills list when the skills call fails', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
			.mockResolvedValueOnce(new Response('nope', { status: 500 }));
		const out = (await load(ev())) as { tableSkills: unknown[] };
		expect(out.tableSkills).toEqual([]);
	});
});
