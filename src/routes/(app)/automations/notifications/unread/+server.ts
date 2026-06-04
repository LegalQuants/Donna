import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { unreadCount } from '$lib/automations/unread.server';

export const GET: RequestHandler = async (event) => {
  return json({ unread: await unreadCount(event) });
};
