import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

// Client-poll proxy for the export job. The card fetches this on an interval;
// the POSTs go through the page form actions. Mirrors files/[id]/+server.ts.
export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/users/me/export/${event.params.job_id}`);
  if (!res.ok) {
    const status = res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
    throw error(status, 'Could not load export status.');
  }
  return json(await res.json());
};
