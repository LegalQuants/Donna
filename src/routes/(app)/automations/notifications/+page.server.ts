import { error, fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseNotificationList } from '$lib/automations/types';
import { unreadCount } from '$lib/automations/unread.server';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const unreadOnly = event.url.searchParams.get('unread') === 'true';
	const path = unreadOnly
		? '/api/v1/autonomous/notifications?unread=true'
		: '/api/v1/autonomous/notifications';
	const [res, unread] = await Promise.all([lqFetch(event, path), unreadCount(event)]);
	if (!res.ok) throw error(502, 'Could not load notifications.');
	const notifications = parseNotificationList(await res.json());
	return { notifications, unreadOnly, unread };
};

export const actions: Actions = {
	markRead: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing notification id.' });
		const res = await lqFetch(
			event,
			`/api/v1/autonomous/notifications/${encodeURIComponent(id)}/read`,
			{ method: 'POST' }
		);
		if (!res.ok) return fail(502, { error: 'Could not mark as read.' });
		return { success: true };
	}
};
