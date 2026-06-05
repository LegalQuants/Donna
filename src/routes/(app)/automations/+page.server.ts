import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseSessionList } from '$lib/automations/types';
import { unreadCount } from '$lib/automations/unread.server';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [res, unread, autonomousEnabled] = await Promise.all([
    lqFetch(event, '/api/v1/autonomous/sessions'),
    unreadCount(event),
    isAutonomousEnabled(event)
  ]);
  if (!res.ok) throw error(502, 'Could not load automations.');
  const sessions = parseSessionList(await res.json());
  return { sessions, unread, autonomousEnabled };
};
