import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}/execute`, {
		method: 'POST',
		body
	});
	if (!res.ok)
		throw error(
			[403, 404, 503, 504].includes(res.status) ? res.status : 502,
			'Could not start the playbook run.'
		);
	return json(await res.json());
};
