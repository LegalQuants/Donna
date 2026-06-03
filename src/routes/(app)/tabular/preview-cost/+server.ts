import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, '/api/v1/tabular/preview-cost', { method: 'POST', body });
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not estimate the review cost.');
  return json(await res.json());
};
