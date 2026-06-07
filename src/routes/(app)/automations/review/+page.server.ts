import { fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { parseMemoryList, MEMORY_STATES } from '$lib/automations/memory';
import type { PageServerLoad, Actions } from './$types';

const LIMIT = 50;

export const load: PageServerLoad = async (event) => {
	const rawState = event.url.searchParams.get('state') ?? '';
	const state = (MEMORY_STATES as readonly string[]).includes(rawState) ? rawState : 'proposed';

	const rawOffset = parseInt(event.url.searchParams.get('offset') ?? '0', 10);
	const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

	const autonomousEnabled = await isAutonomousEnabled(event);

	if (!autonomousEnabled) {
		return { autonomousEnabled, unread: 0, state, offset, entries: [], total: 0 };
	}

	const [unread, res] = await Promise.all([
		unreadCount(event),
		lqFetch(event, `/api/v1/autonomous/memory?state=${state}&limit=${LIMIT}&offset=${offset}`)
	]);

	if (!res.ok) {
		return { autonomousEnabled, unread, state, offset, error: true, entries: [], total: 0 };
	}

	const { entries, total } = parseMemoryList(await res.json());
	return { autonomousEnabled, unread, state, offset, entries, total };
};

export const actions: Actions = {
	keep: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const rawContent = String(form.get('content') ?? '').trim();
		const body: Record<string, string> = {};
		if (rawContent.length > 0) body.content = rawContent;

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}/keep`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	},

	dismiss: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}/dismiss`, {
			method: 'POST',
			body: JSON.stringify({})
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	},

	delete: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing memory id.' });

		const res = await lqFetch(event, `/api/v1/autonomous/memory/${id}`, {
			method: 'DELETE'
		});

		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'This memory no longer exists.', id });
		if (!res.ok) return fail(502, { error: 'Could not update the memory.', id });
		return { ok: true };
	}
};
