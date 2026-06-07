import type { SelectedDoc } from './types';
import type { components } from '$lib/api/backend';

type FileMeta = components['schemas']['File'];

const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 min

export interface UploadItem {
	localId: string;
	name: string;
	status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
	documentId: string | null;
	fileId?: string;
	error?: string;
}

export function createTabularUploads() {
	let items = $state<UploadItem[]>([]);
	const timers = new Map<string, ReturnType<typeof setInterval>>();

	const entry = (localId: string) => items.find((i) => i.localId === localId);

	function clearTimer(localId: string) {
		const t = timers.get(localId);
		if (t) {
			clearInterval(t);
			timers.delete(localId);
		}
	}

	function settle(e: UploadItem, meta: FileMeta, onresolved: (doc: SelectedDoc) => void): boolean {
		const status = meta.ingestion_status ?? 'pending';
		if (status === 'failed') {
			e.status = 'failed';
			e.error = meta.ingestion_error ?? 'Could not process this file.';
			return true;
		}
		if (meta.document_id) {
			e.status = 'ready';
			e.documentId = meta.document_id;
			onresolved({ document_id: meta.document_id, name: e.name });
			return true;
		}
		e.status = status === 'ready' ? 'processing' : status; // ready-but-no-doc: keep polling
		return false;
	}

	function startPoll(
		localId: string,
		fetchFn: typeof fetch,
		onresolved: (doc: SelectedDoc) => void
	) {
		let polls = 0;
		const t = setInterval(async () => {
			polls += 1;
			const e = entry(localId);
			if (!e) {
				clearTimer(localId);
				return;
			}
			if (polls > MAX_POLLS) {
				e.status = 'failed';
				e.error = 'Timed out processing this file.';
				clearTimer(localId);
				return;
			}
			try {
				const res = await fetchFn(`/files/${e.fileId}`);
				if (!res.ok) return;
				const meta = (await res.json()) as FileMeta;
				if (settle(e, meta, onresolved)) clearTimer(localId);
			} catch {
				/* tolerate; keep polling */
			}
		}, POLL_MS);
		timers.set(localId, t);
	}

	async function uploadOne(
		localId: string,
		file: File,
		fetchFn: typeof fetch,
		onresolved: (doc: SelectedDoc) => void
	) {
		const e = entry(localId);
		if (!e) return;
		try {
			const fd = new FormData();
			fd.append('file', file, file.name);
			const res = await fetchFn('/files', { method: 'POST', body: fd });
			if (!res.ok) {
				e.status = 'failed';
				e.error = res.status === 413 ? 'File is too large.' : 'Upload failed.';
				return;
			}
			const meta = (await res.json()) as FileMeta;
			e.fileId = meta.id;
			if (!settle(e, meta, onresolved)) startPoll(localId, fetchFn, onresolved);
		} catch {
			e.status = 'failed';
			e.error = 'Upload failed.';
		}
	}

	return {
		get items() {
			return items;
		},
		async upload(
			files: File[],
			onresolved: (doc: SelectedDoc) => void,
			fetchFn: typeof fetch = fetch
		) {
			for (const file of files) {
				const localId = crypto.randomUUID();
				items = [...items, { localId, name: file.name, status: 'uploading', documentId: null }];
				await uploadOne(localId, file, fetchFn, onresolved);
			}
		},
		remove(localId: string) {
			clearTimer(localId);
			items = items.filter((i) => i.localId !== localId);
		},
		dispose() {
			for (const t of timers.values()) clearInterval(t);
			timers.clear();
		}
	};
}
