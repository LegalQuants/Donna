import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, '/api/v1/skills?scope=builtin');
  // 503/504 are the gateway's unreachable/timeout signals; pass them through so
  // the popover can say "Couldn't load skills". Map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load built-in skills.');
  return json(await res.json());
};
