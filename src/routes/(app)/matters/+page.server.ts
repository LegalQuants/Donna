import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/projects');
  if (!res.ok) throw error(502, 'Could not load matters.');
  return { matters: activeMatters((await res.json()) as Matter[]) };
};

function parsePrivilege(data: FormData): { privileged: boolean; minimum_inference_tier: 1 | 2 | 3 | 4 | 5 | null } {
  const privileged = data.get('privileged') === 'on';
  const raw = String(data.get('minimum_inference_tier') ?? '');
  const tier = raw === '' ? null : (Number(raw) as 1 | 2 | 3 | 4 | 5);
  return { privileged, minimum_inference_tier: tier };
}

export const actions: Actions = {
  create: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const { privileged, minimum_inference_tier } = parsePrivilege(data);
    if (privileged && minimum_inference_tier === null) {
      return fail(422, { error: 'Privileged matters require a minimum tier.' });
    }
    const body: Record<string, unknown> = { name, description, privileged };
    if (minimum_inference_tier !== null) body.minimum_inference_tier = minimum_inference_tier;
    const res = await lqFetch(event, '/api/v1/projects', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status === 422) return fail(422, { error: 'Privileged matters require a minimum tier.' });
      return fail(502, { error: 'Could not create the matter.' });
    }
    const m = (await res.json()) as Matter;
    throw redirect(303, `/matters/${m.id}`);
  }
};
