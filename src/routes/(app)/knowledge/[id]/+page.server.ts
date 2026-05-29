import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PendingUpload } from '$lib/knowledge/types';

export const actions: Actions = {
  uploadFile: async (event) => {
    const data = await event.request.formData();
    const blobs = data.getAll('file').filter((v): v is File => v instanceof File && v.size > 0);
    const uploaded: PendingUpload[] = [];
    for (const blob of blobs) {
      const fd = new FormData();
      fd.append('file', blob, blob.name);
      const upRes = await lqFetch(event, '/api/v1/files', { method: 'POST', body: fd });
      if (!upRes.ok) {
        if (upRes.status === 413) {
          let limitMb = 100;
          try {
            const body = (await upRes.json()) as { details?: { limit_bytes?: number } };
            if (body.details?.limit_bytes) limitMb = Math.round(body.details.limit_bytes / 1024 / 1024);
          } catch {
            /* keep default 100 MB */
          }
          return fail(413, { error: `File "${blob.name}" is too large — max ${limitMb} MB.` });
        }
        return fail(502, { error: `Could not upload "${blob.name}".` });
      }
      const f = (await upRes.json()) as { id: string };
      uploaded.push({
        file_id: f.id,
        filename: blob.name,
        size_bytes: blob.size,
        status: 'pending'
      });
    }
    return { uploaded };
  },

  attachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}/files`, {
      method: 'POST',
      body: JSON.stringify({ file_id })
    });
    // 204 success; 409 = already attached → treat as success (race protection).
    if (res.ok || res.status === 409) return { success: true };
    if (res.status === 422) return fail(422, { retry: true });
    if (res.status === 404) return fail(404, { error: 'Knowledge base or file no longer exists.' });
    return fail(502, { error: 'Could not attach the file.' });
  },

  detachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}/files/${file_id}`, { method: 'DELETE' });
    // 204 or 404 → idempotent success.
    if (res.ok || res.status === 404) return { success: true };
    return fail(502, { error: 'Could not remove the file.' });
  },
};
