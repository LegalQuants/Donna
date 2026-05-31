import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
  if (res.status === 404) throw error(404, 'Playbook not found.');
  if (!res.ok) throw error(502, 'Could not load this playbook.');
  const playbook = (await res.json()) as Playbook;
  return { playbook, isAdmin: event.locals?.user?.is_admin ?? false };
};
