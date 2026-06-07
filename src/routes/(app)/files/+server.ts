import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	// Pass the multipart body straight through; lqFetch/raw preserves the
	// FormData boundary (do NOT set content-type — see P4-3a fix).
	const form = await event.request.formData();
	const res = await lqFetch(event, '/api/v1/files', { method: 'POST', body: form });
	if (!res.ok) {
		if (res.status === 413) {
			let limitMb = 100;
			try {
				const b = (await res.json()) as { details?: { limit_bytes?: number } };
				if (b.details?.limit_bytes) limitMb = Math.round(b.details.limit_bytes / 1024 / 1024);
			} catch {
				/* keep default */
			}
			throw error(413, `File is too large — max ${limitMb} MB.`);
		}
		throw error(502, 'Could not upload the file.');
	}
	return json(await res.json());
};
