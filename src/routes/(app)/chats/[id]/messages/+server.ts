import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
  let content = '';
  let model = 'smart';
  let skills: string[] = [];
  try {
    const body = (await event.request.json()) as { content?: string; model?: string; skills?: string[] };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
    if (Array.isArray(body.skills)) skills = body.skills.filter((s): s is string => typeof s === 'string');
  } catch {
    content = '';
  }

  const payload: { content: string; model: string; stream: true; skills?: string[] } = { content, model, stream: true };
  if (skills.length) payload.skills = skills;

  const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
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
