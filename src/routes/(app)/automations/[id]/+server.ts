import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load the session.');
  }
  return json(await res.json());
};
