import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/tabular/executions/${event.params.id}/cancel`, { method: 'POST' });
  if (!res.ok) throw error([404, 409, 503, 504].includes(res.status) ? res.status : 502, 'Could not cancel the review.');
  return json(await res.json());
};
