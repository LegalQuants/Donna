import { fail, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try { return (await res.json()) as T; } catch { return fallback; }
}

export const load: PageServerLoad = async (event) => {
  const [autonomousEnabled, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] = await Promise.all([
    isAutonomousEnabled(event),
    lqFetch(event, '/api/v1/playbooks'),
    lqFetch(event, '/api/v1/user-skills?scope=user'),
    lqFetch(event, '/api/v1/skills?scope=builtin'),
    lqFetch(event, '/api/v1/knowledge-bases'),
    lqFetch(event, '/api/v1/projects')
  ]);

  const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(playbooksRes, []);
  const userSkills = (await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, []))
    .filter((s) => Boolean(s.slug));
  const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(builtinsRes, []);
  const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
  const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

  return {
    autonomousEnabled,
    playbookItems: toPlaybookItems(playbooks),
    skillItems: toSkillItems(userSkills, builtins),
    kbs,
    matters: matters.map((m) => ({ id: m.id, name: m.name }))
  };
};

export const actions: Actions = {
  run: async (event) => {
    const form = await event.request.formData();
    const mode = String(form.get('source_mode') ?? 'playbook');
    const playbookId = String(form.get('playbook_id') ?? '');
    const skillRef = String(form.get('skill_ref') ?? '');
    const targetKbId = String(form.get('target_kb_id') ?? '');
    const projectId = String(form.get('project_id') ?? '');
    const maxCost = String(form.get('max_cost_usd') ?? '').trim();

    const sourceOk = mode === 'skill' ? Boolean(skillRef) : Boolean(playbookId);
    if (!sourceOk || !targetKbId) {
      return fail(400, { error: 'Choose a source and a target knowledge base.' });
    }

    const body: Record<string, string> = { target_kb_id: targetKbId };
    if (mode === 'skill') body.skill_ref = skillRef; else body.playbook_id = playbookId;
    if (projectId) body.project_id = projectId;
    if (maxCost && Number.isFinite(Number(maxCost)) && Number(maxCost) >= 0) body.max_cost_usd = maxCost;

    const res = await lqFetch(event, '/api/v1/autonomous/run-now', { method: 'POST', body: JSON.stringify(body) });
    if (res.status === 403) throw redirect(303, '/automations'); // not opted in → gate
    if (!res.ok) return fail(res.status === 422 ? 422 : 502, { error: 'Could not start the run.' });
    const session = (await res.json()) as { id?: string };
    if (!session.id) return fail(502, { error: 'The run started but returned no id.' });
    throw redirect(303, `/automations/${session.id}`);
  }
};
