import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/files/${event.params.id}/content`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load file content.');
  // Pass the upstream bytes straight through (no buffering); preserve the stored
  // MIME type so the client can choose PDF.js vs. a fallback. Like the SSE/export routes.
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
};
