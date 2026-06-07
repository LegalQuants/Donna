import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const format = event.url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
	const res = await lqFetch(
		event,
		`/api/v1/tabular/executions/${event.params.id}/export?format=${format}`
	);
	if (!res.ok)
		throw error(
			[404, 409, 503, 504].includes(res.status) ? res.status : 502,
			'Could not export the review.'
		);
	return new Response(res.body, {
		status: res.status,
		headers: {
			'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
			'content-disposition': `attachment; filename="tabular-review.${format}"`,
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
