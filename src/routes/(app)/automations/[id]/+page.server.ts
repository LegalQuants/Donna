import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseReceipt, parseSessionSummary } from '$lib/automations/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(502, 'Could not load the session.');
  }
  const body = (await res.json()) as { session?: unknown; receipt?: unknown };
  const session = parseSessionSummary(body.session);
  if (!session) throw error(502, 'Malformed session response.');
  return { session, receipt: parseReceipt(body.receipt) };
};
