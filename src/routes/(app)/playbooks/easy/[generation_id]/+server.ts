import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/easy/${event.params.generation_id}`);
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load the generation.');
  return json(await res.json());
};
