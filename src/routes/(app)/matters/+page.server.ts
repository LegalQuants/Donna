import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/projects');
  if (!res.ok) throw error(502, 'Could not load matters.');
  return { matters: activeMatters((await res.json()) as Matter[]) };
};

export const actions: Actions = {
  create: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const res = await lqFetch(event, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) return fail(502, { error: 'Could not create the matter.' });
    const m = (await res.json()) as Matter;
    throw redirect(303, `/matters/${m.id}`);
  }
};
