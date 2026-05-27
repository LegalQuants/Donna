import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/projects');
  const matters = res.ok ? activeMatters((await res.json()) as Matter[]) : [];
  return { matters };
};

export const actions: Actions = {
  start: async (event) => {
    const data = await event.request.formData();
    const message = String(data.get('message') ?? '').trim();
    const projectId = String(data.get('project_id') ?? '').trim();

    const res = await lqFetch(event, '/api/v1/chats', {
      method: 'POST',
      body: JSON.stringify(projectId ? { project_id: projectId } : {})
    });
    if (!res.ok) return fail(502, { error: 'Could not start a chat. Please try again.' });

    const chat = (await res.json()) as { id: string };
    if (message) {
      event.cookies.set('donna_draft', message, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 120 });
    }
    throw redirect(303, `/chats/${chat.id}`);
  }
};
