import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const q = event.url.searchParams.get('q') ?? '';
  const limit = event.url.searchParams.get('limit') ?? '8';
  const path = `/api/v1/skills/autocomplete?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
  const res = await lqFetch(event, path);
  // 503/504 are the gateway's documented unreachable/timeout signals; pass them
  // through so the popover can show "Couldn't load skills"; map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load skills.');
  return json(await res.json());
};
