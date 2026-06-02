import type { FileMeta, AttachedFile } from './types';

const MAX_FILES = 16;
const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 min at 2s, mirrors KbFileRow's stuck cap

export function createFileAttach() {
  let attached = $state<AttachedFile[]>([]);
  let capNote = $state(false);
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const entry = (localId: string) => attached.find((f) => f.localId === localId);

  function clearTimer(localId: string) {
    const t = timers.get(localId);
    if (t) {
      clearInterval(t);
      timers.delete(localId);
    }
  }

  function startPoll(localId: string, fetchFn: typeof fetch) {
    let polls = 0;
    const t = setInterval(async () => {
      polls += 1;
      const e = entry(localId);
      if (!e || !e.fileId) {
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
        if (!res.ok) return; // tolerate transient errors; keep polling
        const file = (await res.json()) as FileMeta;
        const s = file.ingestion_status ?? 'pending';
        e.status = s;
        if (s === 'failed') e.error = file.ingestion_error ?? 'Could not process this file.';
        if (s === 'ready' || s === 'failed') clearTimer(localId);
      } catch {
        /* tolerate; keep polling */
      }
    }, POLL_MS);
    timers.set(localId, t);
  }

  async function uploadOne(localId: string, file: File, fetchFn: typeof fetch) {
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
      const uploaded = (await res.json()) as FileMeta;
      e.fileId = uploaded.id;
      const s = uploaded.ingestion_status ?? 'pending';
      e.status = s;
      if (s === 'failed') e.error = uploaded.ingestion_error ?? 'Could not process this file.';
      else if (s !== 'ready') startPoll(localId, fetchFn);
    } catch {
      e.status = 'failed';
      e.error = 'Upload failed.';
    }
  }

  return {
    get attached() {
      return attached;
    },
    get capNote() {
      return capNote;
    },
    /** Ready files' backend ids — what goes into MessageCreate.file_ids. */
    get fileIds() {
      return attached.filter((f) => f.status === 'ready' && f.fileId).map((f) => f.fileId as string);
    },
    /** True when every attached file is ready (a non-ready or failed file blocks Send). */
    get allReady() {
      return attached.every((f) => f.status === 'ready');
    },
    async attach(files: File[], fetchFn: typeof fetch = fetch) {
      capNote = false;
      for (const file of files) {
        if (attached.length >= MAX_FILES) {
          capNote = true;
          break;
        }
        const localId = crypto.randomUUID();
        attached = [...attached, { localId, name: file.name, fileId: null, status: 'uploading' }];
        await uploadOne(localId, file, fetchFn);
      }
    },
    remove(localId: string) {
      clearTimer(localId);
      attached = attached.filter((f) => f.localId !== localId);
    },
    dispose() {
      for (const t of timers.values()) clearInterval(t);
      timers.clear();
    }
  };
}
