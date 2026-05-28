import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Matter } from '$lib/matters/types';
import type { components } from '$lib/api/backend';
import type { PageServerLoad } from './$types';

type Chat = components['schemas']['Chat'];

export const load: PageServerLoad = async (event) => {
  const [mRes, cRes] = await Promise.all([
    lqFetch(event, `/api/v1/projects/${event.params.id}`),
    lqFetch(event, `/api/v1/chats?project_id=${event.params.id}`)
  ]);
  if (!mRes.ok) throw error(mRes.status === 404 ? 404 : 502, 'Could not load this matter.');
  const matter = (await mRes.json()) as Matter;
  const chats = cRes.ok ? (((await cRes.json()) as { items: Chat[] }).items ?? []) : [];
  return { matter, chats };
};

export const actions: Actions = {
  rename: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) return fail(502, { error: 'Could not rename the matter.' });
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
  }
};
