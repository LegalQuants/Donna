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
  }
};
