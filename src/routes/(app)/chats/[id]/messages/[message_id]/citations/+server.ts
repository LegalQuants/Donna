import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(
    event,
    `/api/v1/chats/${event.params.id}/messages/${event.params.message_id}/citations`
  );
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load citations.');
  return json(await res.json());
};
