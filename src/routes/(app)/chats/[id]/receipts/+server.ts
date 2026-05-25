import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const kinds = event.url.searchParams.get('event_kinds');
  const path = `/api/v1/chats/${event.params.id}/receipts${kinds ? `?event_kinds=${encodeURIComponent(kinds)}` : ''}`;
  const res = await lqFetch(event, path);
  if (!res.ok) throw error(res.status === 403 ? 403 : res.status === 404 ? 404 : 502, 'Could not load receipts.');
  return json(await res.json());
};
