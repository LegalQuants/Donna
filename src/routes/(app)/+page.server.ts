import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

export const actions: Actions = {
  start: async (event) => {
    const data = await event.request.formData();
    const message = String(data.get('message') ?? '').trim();

    const res = await lqFetch(event, '/api/v1/chats', { method: 'POST', body: JSON.stringify({}) });
    if (!res.ok) return fail(502, { error: 'Could not start a chat. Please try again.' });

    const chat = (await res.json()) as { id: string };
    if (message) {
      event.cookies.set('donna_draft', message, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 120 });
    }
    throw redirect(303, `/chats/${chat.id}`);
  }
};
