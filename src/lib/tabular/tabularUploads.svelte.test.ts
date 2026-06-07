import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTabularUploads } from './tabularUploads.svelte';

const uploadRes = (status: string, id = 'f1') =>
	new Response(JSON.stringify({ id, filename: 'a.pdf', ingestion_status: status }), {
		status: 201
	});
const metaRes = (status: string, documentId: string | null, id = 'f1') =>
	new Response(JSON.stringify({ id, ingestion_status: status, document_id: documentId }), {
		status: 200
	});
const file = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTabularUploads', () => {
	it('uploads, polls until document_id is non-null, then resolves', async () => {
		const resolved: { document_id: string; name: string }[] = [];
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValueOnce(metaRes('processing', null))
			.mockResolvedValueOnce(metaRes('ready', 'doc-1'));
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('processing');
		expect(up.items[0].documentId).toBeNull();
		await vi.advanceTimersByTimeAsync(2000);
		expect(resolved).toEqual([]); // ready false / document_id null still
		await vi.advanceTimersByTimeAsync(2000);
		expect(up.items[0].status).toBe('ready');
		expect(up.items[0].documentId).toBe('doc-1');
		expect(resolved).toEqual([{ document_id: 'doc-1', name: 'a.pdf' }]);
		expect(f.mock.calls[1][0]).toBe('/files/f1');
	});

	it('resolves immediately when the upload already returns ready with a document_id', async () => {
		const resolved: { document_id: string; name: string }[] = [];
		const up = createTabularUploads();
		const f = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'f1',
					filename: 'a.pdf',
					ingestion_status: 'ready',
					document_id: 'doc-9'
				}),
				{ status: 201 }
			)
		);
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('ready');
		expect(resolved).toEqual([{ document_id: 'doc-9', name: 'a.pdf' }]);
	});

	it('marks failed on a non-OK upload and never resolves', async () => {
		const resolved: unknown[] = [];
		const up = createTabularUploads();
		const f = vi.fn().mockResolvedValue(new Response('too big', { status: 413 }));
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('failed');
		expect(up.items[0].error).toBe('File is too large.');
		expect(resolved).toEqual([]);
	});

	it('marks failed when ingestion fails', async () => {
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValueOnce(metaRes('failed', null));
		await up.upload([file()], () => {}, f);
		await vi.advanceTimersByTimeAsync(2000);
		expect(up.items[0].status).toBe('failed');
	});

	it('remove stops the poll; dispose stops all polls', async () => {
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValue(metaRes('processing', null));
		await up.upload([file()], () => {}, f);
		const localId = up.items[0].localId;
		const before = f.mock.calls.length;
		up.remove(localId);
		await vi.advanceTimersByTimeAsync(6000);
		expect(f.mock.calls.length).toBe(before);
		expect(up.items).toEqual([]);

		const up2 = createTabularUploads();
		const g = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValue(metaRes('processing', null));
		await up2.upload([file()], () => {}, g);
		const before2 = g.mock.calls.length;
		up2.dispose();
		await vi.advanceTimersByTimeAsync(6000);
		expect(g.mock.calls.length).toBe(before2);
	});
});
