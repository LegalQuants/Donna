import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
  let content = '';
  let model = 'smart';
  try {
    const body = (await event.request.json()) as { content?: string; model?: string };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
  } catch {
    content = '';
  }

  const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, model, stream: true })
  });

  // Pipe the upstream SSE body straight through (no buffering). On a non-2xx
  // upstream the body is the JSON error envelope; forward status + body so the
  // client's res.ok check surfaces it.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache'
    }
  });
};
