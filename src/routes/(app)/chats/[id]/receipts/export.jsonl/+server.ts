import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/receipts/export.jsonl`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not export receipts.');
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/x-ndjson',
      'content-disposition':
        res.headers.get('content-disposition') ?? `attachment; filename="chat-${event.params.id}-receipts.jsonl"`,
      'cache-control': 'no-store'
    }
  });
};
