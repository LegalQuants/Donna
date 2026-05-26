import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, '/api/v1/enhance-prompt', { method: 'POST', body });
  // 503/504 are the gateway's documented unreachable/timeout signals; pass them
  // through so the client can show "enhance unavailable"; map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not enhance the prompt.');
  return json(await res.json());
};
