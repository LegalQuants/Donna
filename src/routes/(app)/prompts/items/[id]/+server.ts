import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const PATCH: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, `/api/v1/saved-prompts/${event.params.id}`, { method: 'PATCH', body });
  if (!res.ok) throw error(res.status === 422 ? 422 : res.status === 404 ? 404 : 502, 'Could not update the prompt.');
  return json(await res.json());
};

export const DELETE: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/saved-prompts/${event.params.id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw error(502, 'Could not delete the prompt.');
  return new Response(null, { status: 204 });
};
