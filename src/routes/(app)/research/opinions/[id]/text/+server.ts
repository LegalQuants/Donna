import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

// Extracts the opinion plaintext so the doc panel's TextViewer can fetch it as
// a content URL (parallel to /files/{id}/content). The backend returns JSON
// {opinion_id, cluster_id, text_field_used, text}; we surface text/plain.
export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/research/opinions/${event.params.id}`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load that opinion.');
	const body = (await res.json()) as { text?: unknown };
	const text = typeof body.text === 'string' ? body.text : '';
	return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
