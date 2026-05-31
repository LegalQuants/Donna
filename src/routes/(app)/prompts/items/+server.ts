import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, '/api/v1/saved-prompts');
  if (!res.ok) throw error(502, 'Could not load your prompts.');
  return json(await res.json());
};

export const POST: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, '/api/v1/saved-prompts', { method: 'POST', body });
  if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Could not save the prompt.');
  return json(await res.json());
};
