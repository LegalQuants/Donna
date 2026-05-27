import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/files/${event.params.id}`);
  if (!res.ok) {
    // 404 (missing/soft-deleted/cross-user) and the gateway 503/504 signals pass
    // through; anything else becomes 502.
    const status = res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
    throw error(status, 'Could not load file metadata.');
  }
  return json(await res.json());
};
