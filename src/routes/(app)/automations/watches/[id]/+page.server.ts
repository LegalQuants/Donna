import { fail, error, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseWatchList, buildWatchBody } from '$lib/automations/watches';
import { jsonOr, errorDetail } from '$lib/server/loadJson';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
  if (!(await isAutonomousEnabled(event))) throw error(403, 'Automations are turned off.');

  const [unread, watchesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] = await Promise.all([
    unreadCount(event),
    lqFetch(event, '/api/v1/autonomous/watches'),
    lqFetch(event, '/api/v1/playbooks'),
    lqFetch(event, '/api/v1/user-skills?scope=user'),
    lqFetch(event, '/api/v1/skills?scope=builtin'),
    lqFetch(event, '/api/v1/knowledge-bases'),
    lqFetch(event, '/api/v1/projects')
  ]);
  if (!watchesRes.ok) throw error(502, 'Could not load watches.');

  const watch = parseWatchList(await watchesRes.json()).find((x) => x.id === event.params.id);
  if (!watch) throw error(404, 'Watch not found.');

  const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(playbooksRes, []);
  const userSkills = (await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, []))
    .filter((s) => Boolean(s.slug));
  const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(builtinsRes, []);
  const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
  const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

  return {
    watch,
    unread,
    playbookItems: toPlaybookItems(playbooks),
    skillItems: toSkillItems(userSkills, builtins),
    kbs,
    matters: matters.map((m) => ({ id: m.id, name: m.name }))
  };
};

export const actions: Actions = {
  update: async (event) => {
    const built = buildWatchBody(await event.request.formData(), 'update');
    if (!built.ok) return fail(400, { error: 'Choose a source.' });
    const res = await lqFetch(event, `/api/v1/autonomous/watches/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(built.body) });
    if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
    if (res.status === 404) {
      // fc832ca: PATCH also 404s on an unowned/missing project_id ("project not found").
      if ((await errorDetail(res)).includes('project'))
        return fail(404, { error: 'That matter was not found — it may have been deleted or belong to another account.', field: 'matter' });
      return fail(404, { error: 'Watch not found.' });
    }
    if (res.status === 422) return fail(422, { error: 'Choose exactly one of a playbook or a skill.' });
    if (!res.ok) return fail(502, { error: 'Could not save the watch.' });
    throw redirect(303, '/automations/watches');
  }
};
