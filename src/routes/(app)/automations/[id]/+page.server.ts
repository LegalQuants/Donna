import { error, fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseReceipt, parseSessionSummary } from '$lib/automations/types';
import { loadRunOutput } from '$lib/automations/runOutput.server';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const [res, output] = await Promise.all([
		lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
		loadRunOutput(event, event.params.id)
	]);
	if (!res.ok) {
		if (res.status === 404) throw error(404, 'Session not found.');
		throw error(502, 'Could not load the session.');
	}
	const body = (await res.json()) as { session?: unknown; receipt?: unknown };
	const session = parseSessionSummary(body.session);
	if (!session) throw error(502, 'Malformed session response.');
	return { session, receipt: parseReceipt(body.receipt), ...output };
};

async function memoryAction(event: Parameters<Actions[string]>[0], endpoint: 'keep' | 'dismiss') {
	const fd = await event.request.formData();
	const id = fd.get('id');
	if (!id || typeof id !== 'string') return fail(400, { error: 'Missing memory id.' });
	const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({})
	});
	if (res.ok) return { ok: true };
	if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
	if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
	return fail(502, { error: 'Could not update the memory.', id });
}

export const actions: Actions = {
	keepMemory: (event) => memoryAction(event, 'keep'),
	dismissMemory: (event) => memoryAction(event, 'dismiss')
};
