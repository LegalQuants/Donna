import { fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad, Actions } from './$types';
import type { ModelsListResponse } from '$lib/models/types';
import { availableTargets, orderedChatCategories, categoryFromEntry, categoryFromOption, localModels, reassignPatchBody } from '$lib/inference/inference';
import type { AdminAliasEntry, CategoryView, ModelTarget } from '$lib/inference/types';

export const load: PageServerLoad = async (event) => {
  const isAdmin = !!event.locals.user?.is_admin;

  const modelsRes = await lqFetch(event, '/api/v1/models');
  if (!modelsRes.ok) {
    return { isAdmin, categories: [] as CategoryView[], targets: [] as ModelTarget[], localModels: [] as ModelTarget[], modelsError: true };
  }
  const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
  const options = orderedChatCategories(raw);
  const targets = availableTargets(raw);
  const local = localModels(raw);

  let categories: CategoryView[];
  if (isAdmin) {
    const aRes = await lqFetch(event, '/api/v1/admin/aliases');
    const entries = aRes.ok ? (((await aRes.json()) as { data: AdminAliasEntry[] }).data ?? []) : [];
    const byName = new Map(entries.map((e) => [e.name, e]));
    categories = options.map((o) => {
      const e = byName.get(o.id);
      return e ? categoryFromEntry(e) : categoryFromOption(o);
    });
  } else {
    categories = options.map(categoryFromOption);
  }

  return { isAdmin, categories, targets, localModels: local, modelsError: false };
};

export const actions: Actions = {
  reassign: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '');
    const targetId = String(data.get('target_id') ?? '');
    if (!name || !targetId) return fail(400, { message: 'Missing category or model.' });

    const modelsRes = await lqFetch(event, '/api/v1/models');
    if (!modelsRes.ok) return fail(502, { message: 'Could not load models.' });
    const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
    const target = availableTargets(raw).find((t) => t.id === targetId);
    if (!target) return fail(400, { message: 'Unknown model.' });

    const getRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`);
    if (getRes.status === 403) return fail(403, { message: 'Changing model routing requires an admin account.' });
    if (!getRes.ok) return fail(getRes.status === 404 ? 404 : 502, { message: 'Could not read the category.' });
    const entry = (await getRes.json()) as AdminAliasEntry;

    const patchRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(reassignPatchBody(entry, target))
    });
    if (patchRes.status === 403) return fail(403, { message: 'Changing model routing requires an admin account.' });
    if (!patchRes.ok) return fail(patchRes.status >= 400 && patchRes.status < 500 ? 400 : 502, { message: 'Could not update the category.' });
    return { success: true };
  }
};
