import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
	let decision: 'approve' | 'deny' = 'deny';
	try {
		const body = (await event.request.json()) as { decision?: unknown };
		if (body.decision === 'approve') decision = 'approve';
	} catch {
		decision = 'deny';
	}

	const upstream = await lqStream(
		event,
		`/api/v1/chats/${event.params.id}/tool-calls/${event.params.pending_call_id}`,
		{ method: 'POST', body: JSON.stringify({ decision }) }
	);

	// Pipe the resumed SSE straight back; forward a non-2xx status so the client's
	// res.ok check surfaces 404 (expired/non-owner) / 409 (already resolved).
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
			'cache-control': 'no-cache'
		}
	});
};
