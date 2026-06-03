import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ModelsListResponse } from '$lib/models/types';
import { availableTargets, orderedChatCategories, categoryFromEntry, categoryFromOption, localModels } from '$lib/inference/inference';
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
