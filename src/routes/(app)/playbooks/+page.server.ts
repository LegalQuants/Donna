import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/playbooks');
  if (!res.ok) throw error(502, 'Could not load playbooks.');
  const playbooks = (await res.json()) as Playbook[];
  return { playbooks };
};
