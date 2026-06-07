import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileAttach } from './fileAttach.svelte';

const uploadRes = (status: string, id = 'f1') =>
	new Response(JSON.stringify({ id, filename: 'a.txt', ingestion_status: status }), {
		status: 201
	});
const metaRes = (status: string, id = 'f1') =>
	new Response(JSON.stringify({ id, ingestion_status: status }), { status: 200 });
const file = (name = 'a.txt') => new File(['x'], name, { type: 'text/plain' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createFileAttach', () => {
	it('starts empty', () => {
		const fa = createFileAttach();
		expect(fa.attached).toEqual([]);
		expect(fa.fileIds).toEqual([]);
		expect(fa.allReady).toBe(true);
	});

	it('uploads to ready immediately and exposes the file id', async () => {
		const fa = createFileAttach();
		const f = vi.fn().mockResolvedValue(uploadRes('ready'));
		await fa.attach([file()], f);
		expect(f.mock.calls[0][0]).toBe('/files');
		expect((f.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);
		expect(fa.attached[0].status).toBe('ready');
		expect(fa.fileIds).toEqual(['f1']);
		expect(fa.allReady).toBe(true);
	});

	it('polls pending → processing → ready and gates allReady until ready', async () => {
		const fa = createFileAttach();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('pending'))
			.mockResolvedValueOnce(metaRes('processing'))
			.mockResolvedValueOnce(metaRes('ready'));
		await fa.attach([file()], f);
		expect(fa.attached[0].status).toBe('pending');
		expect(fa.allReady).toBe(false);
		await vi.advanceTimersByTimeAsync(2000);
		expect(fa.attached[0].status).toBe('processing');
		expect(fa.allReady).toBe(false);
		await vi.advanceTimersByTimeAsync(2000);
		expect(fa.attached[0].status).toBe('ready');
		expect(fa.fileIds).toEqual(['f1']);
		expect(f.mock.calls[1][0]).toBe('/files/f1');
	});

	it('marks failed (and blocks allReady) on a non-OK upload', async () => {
		const fa = createFileAttach();
		const f = vi.fn().mockResolvedValue(new Response('too big', { status: 413 }));
		await fa.attach([file()], f);
		expect(fa.attached[0].status).toBe('failed');
		expect(fa.allReady).toBe(false);
		expect(fa.fileIds).toEqual([]);
	});

	it('fileIds returns only ready files', async () => {
		const fa = createFileAttach();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('ready', 'r1'))
			.mockResolvedValueOnce(uploadRes('processing', 'p1'));
		await fa.attach([file('r.txt')], f);
		await fa.attach([file('p.txt')], f);
		expect(fa.fileIds).toEqual(['r1']);
		expect(fa.allReady).toBe(false);
	});

	it('caps at 16 files and flags capNote', async () => {
		const fa = createFileAttach();
		const f = vi.fn().mockResolvedValue(uploadRes('ready'));
		await fa.attach(
			Array.from({ length: 18 }, (_, i) => file(`f${i}.txt`)),
			f
		);
		expect(fa.attached.length).toBe(16);
		expect(fa.capNote).toBe(true);
	});

	it('remove stops the poll (no further fetches)', async () => {
		const fa = createFileAttach();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('pending'))
			.mockResolvedValue(metaRes('processing'));
		await fa.attach([file()], f);
		const localId = fa.attached[0].localId;
		const callsBefore = f.mock.calls.length;
		fa.remove(localId);
		await vi.advanceTimersByTimeAsync(6000);
		expect(f.mock.calls.length).toBe(callsBefore);
		expect(fa.attached).toEqual([]);
	});

	it('dispose stops all polls', async () => {
		const fa = createFileAttach();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('pending'))
			.mockResolvedValue(metaRes('processing'));
		await fa.attach([file()], f);
		const callsBefore = f.mock.calls.length;
		fa.dispose();
		await vi.advanceTimersByTimeAsync(6000);
		expect(f.mock.calls.length).toBe(callsBefore);
	});
});
