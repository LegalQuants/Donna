import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
  if (res.status === 404) throw error(404, 'Playbook not found.');
  if (!res.ok) throw error(502, 'Could not load this playbook.');
  const playbook = (await res.json()) as Playbook;
  return {
    playbook,
    isAdmin: event.locals?.user?.is_admin ?? false,
    isOwner: !!playbook.created_by && playbook.created_by === event.locals?.user?.id
  };
};

export const actions: Actions = {
  delete: async (event) => {
    const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`, { method: 'DELETE' });
    if (res.status === 403) return fail(403, { error: 'You can only delete playbooks you own.' });
    if (!res.ok && res.status !== 404) return fail(502, { error: 'Could not delete the playbook.' });
    throw redirect(303, '/playbooks');
  }
};
