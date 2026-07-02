import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const messageId = event.url.searchParams.get('message_id');
	const q = messageId ? `?message_id=${encodeURIComponent(messageId)}` : '';
	const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/ledger${q}`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load the ledger.');
	return json(await res.json());
};
