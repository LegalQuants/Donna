import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, '/api/v1/tabular/execute', { method: 'POST', body });
  if (!res.ok) {
    if (res.status === 404 || res.status === 422)
      throw error(400, 'One or more selected documents could not be found or are not accessible. Re-check your document selection.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not start the review.');
  }
  return json(await res.json());
};
