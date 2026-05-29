import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Matter } from '$lib/matters/types';
import { parsePrivilegeFields } from '$lib/matters/parseFormFields';
import type { components } from '$lib/api/backend';
import type { PageServerLoad } from './$types';

type Chat = components['schemas']['Chat'];
type KnowledgeBase = components['schemas']['KnowledgeBase'];
type ProjectFile = components['schemas']['File'];

export const load: PageServerLoad = async (event) => {
  const [mRes, cRes] = await Promise.all([
    lqFetch(event, `/api/v1/projects/${event.params.id}`),
    lqFetch(event, `/api/v1/chats?project_id=${event.params.id}`)
  ]);
  if (!mRes.ok) throw error(mRes.status === 404 ? 404 : 502, 'Could not load this matter.');
  const matter = (await mRes.json()) as Matter;
  const chats = cRes.ok ? (((await cRes.json()) as { items: Chat[] }).items ?? []) : [];

  const [filesArr, kbLinkedRes, kbAllRes] = await Promise.all([
    Promise.all(
      (matter.attached_file_ids ?? []).map(async (id) => {
        const r = await lqFetch(event, `/api/v1/files/${id}`);
        return r.ok ? ((await r.json()) as ProjectFile) : null;
      })
    ),
    lqFetch(event, `/api/v1/knowledge-bases?project_id=${event.params.id}`),
    lqFetch(event, '/api/v1/knowledge-bases')
  ]);
  const files = filesArr.filter((f): f is ProjectFile => f !== null);
  const linked = kbLinkedRes.ok ? ((await kbLinkedRes.json()) as KnowledgeBase[]) : [];
  const allKbs = kbAllRes.ok ? ((await kbAllRes.json()) as KnowledgeBase[]) : [];
  const linkedIds = new Set(linked.map((k) => k.id));
  const available = allKbs.filter((k) => !linkedIds.has(k.id));

  return { matter, chats, files, kbs: { linked, available } };
};

export const actions: Actions = {
  rename: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const { privileged, minimum_inference_tier } = parsePrivilegeFields(data);
    if (privileged && minimum_inference_tier === null) {
      return fail(400, { error: 'Privileged matters require a minimum tier.' });
    }
    const body = { name, description, privileged, minimum_inference_tier };
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status === 400) return fail(400, { error: 'Privileged matters require a minimum tier.' });
      return fail(502, { error: 'Could not rename the matter.' });
    }
    return { success: true };
  },

  archive: async (event) => {
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'DELETE' });
    if (!res.ok) return fail(502, { error: 'Could not archive the matter.' });
    throw redirect(303, '/matters');
  },

  newChat: async (event) => {
    const res = await lqFetch(event, '/api/v1/chats', {
      method: 'POST',
      body: JSON.stringify({ project_id: event.params.id })
    });
    if (!res.ok) return fail(502, { error: 'Could not start a chat.' });
    const chat = (await res.json()) as Chat;
    throw redirect(303, `/chats/${chat.id}`);
  },

  uploadFile: async (event) => {
    const data = await event.request.formData();
    const blobs = data.getAll('file').filter((v): v is File => v instanceof File && v.size > 0);
    let uploaded = 0;
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
      const { id: file_id } = (await upRes.json()) as { id: string };
      const attRes = await lqFetch(event, `/api/v1/projects/${event.params.id}/files`, {
        method: 'POST',
        body: JSON.stringify({ file_id })
      });
      // 204 = success; 409 = already attached (treat as success — race).
      if (!attRes.ok && attRes.status !== 409) {
        return fail(502, { error: `Could not upload "${blob.name}".` });
      }
      uploaded += 1;
    }
    return { uploaded };
  },

  detachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/files/${file_id}`, { method: 'DELETE' });
    // 204 or 404 → idempotent success.
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not remove the file.' });
    }
    return { success: true };
  },

  linkKb: async (event) => {
    const data = await event.request.formData();
    const kb_id = String(data.get('kb_id') ?? '');
    if (!kb_id) return fail(400, { error: 'Missing kb_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${kb_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ project_id: event.params.id })
    });
    if (!res.ok) {
      if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
      return fail(502, { error: 'Could not link the knowledge base.' });
    }
    return { success: true };
  },

  unlinkKb: async (event) => {
    const data = await event.request.formData();
    const kb_id = String(data.get('kb_id') ?? '');
    if (!kb_id) return fail(400, { error: 'Missing kb_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${kb_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ project_id: null })
    });
    // 200 + 404 → success (already gone is fine for the UI).
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not unlink the knowledge base.' });
    }
    return { success: true };
  },

  attachSkill: async (event) => {
    const data = await event.request.formData();
    const skill_name = String(data.get('skill_name') ?? '');
    if (!skill_name) return fail(400, { error: 'Missing skill_name.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({ skill_name })
    });
    // 204 = success; 409 = already attached (silent success — race).
    if (!res.ok && res.status !== 409) {
      if (res.status === 404) return fail(404, { error: 'Skill no longer exists.' });
      return fail(502, { error: 'Could not attach the skill.' });
    }
    return { success: true };
  },

  detachSkill: async (event) => {
    const data = await event.request.formData();
    const skill_name = String(data.get('skill_name') ?? '');
    if (!skill_name) return fail(400, { error: 'Missing skill_name.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/skills/${skill_name}`, { method: 'DELETE' });
    // 204 + 404 → silent success.
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not detach the skill.' });
    }
    return { success: true };
  },

  saveContext: async (event) => {
    const data = await event.request.formData();
    const raw = String(data.get('context_md') ?? '');
    if (new TextEncoder().encode(raw).length > 102_400) {
      return fail(422, { error: 'Context exceeds the 100 KiB limit.' });
    }
    const body = { context_md: raw === '' ? null : raw };
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status === 422) return fail(422, { error: 'Context exceeds the 100 KiB limit.' });
      return fail(502, { error: 'Could not save the context.' });
    }
    return { success: true };
  },

  createKb: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const res = await lqFetch(event, '/api/v1/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name, project_id: event.params.id, hybrid_alpha: 0.5 })
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Matter no longer exists.' });
    return fail(502, { error: 'Could not create the knowledge base.' });
  },
};
