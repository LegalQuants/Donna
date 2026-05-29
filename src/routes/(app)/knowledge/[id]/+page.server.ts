import { fail, redirect, type Actions } from '@sveltejs/kit';
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

  rename: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const descriptionRaw = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const body = { name, description: descriptionRaw === '' ? null : descriptionRaw };
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
    return fail(502, { error: 'Could not rename the knowledge base.' });
  },

  archive: async (event) => {
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, { method: 'DELETE' });
    if (!res.ok) return fail(502, { error: 'Could not archive the knowledge base.' });
    throw redirect(303, '/knowledge');
  },

  setHybridAlpha: async (event) => {
    const data = await event.request.formData();
    const raw = String(data.get('hybrid_alpha') ?? '');
    const value = Number(raw);
    // Defensive: slider client-constrains to [0,1] per ADR 0008; reject anything else.
    if (raw === '' || !Number.isFinite(value) || value < 0 || value > 1) {
      return fail(422, { error: 'hybrid_alpha must be a number between 0 and 1.' });
    }
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hybrid_alpha: value })
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
    return fail(502, { error: 'Could not save the hybrid alpha.' });
  },
};
