import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { UserSkill, UserSkillCreate } from '$lib/skills/authoring/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/user-skills?scope=user');
  if (!res.ok) throw error(502, 'Could not load your skills.');
  const all = (await res.json()) as UserSkill[];
  const skills = all
    .filter((s) => !s.archived_at)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return { skills };
};

export const actions: Actions = {
  create: async (event) => {
    const data = await event.request.formData();
    const display_name = String(data.get('display_name') ?? '').trim();
    const slug = String(data.get('slug') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const body = String(data.get('body') ?? '');
    const tags = data.getAll('tags').map(String).filter(Boolean);
    const slash_alias = String(data.get('slash_alias') ?? '').trim();

    if (!display_name || !slug || !body.trim()) {
      return fail(400, { error: 'Name, slug, and body are required.' });
    }

    const payload: UserSkillCreate = {
      slug,
      display_name,
      description,
      body,
      version: '1.0.0', // default; the edit page lets users change it later
      scope: 'user',
      tags
    };
    if (slash_alias) payload.slash_alias = slash_alias;

    const res = await lqFetch(event, '/api/v1/user-skills', { method: 'POST', body: JSON.stringify(payload) });
    if (res.status === 201) {
      const created = (await res.json()) as UserSkill;
      throw redirect(303, `/skills/${created.id}`);
    }
    if (res.status === 409) return fail(409, { field: 'slug', error: 'A skill with that name already exists.' });
    if (res.status === 422) return fail(422, { field: 'slash_alias', error: 'That slash command is already in use.' });
    return fail(502, { error: 'Could not create the skill.' });
  },

  fork: async (event) => {
    const data = await event.request.formData();
    const skill_name = String(data.get('skill_name') ?? '').trim();
    const new_name = String(data.get('new_name') ?? '').trim();
    if (!skill_name) return fail(400, { error: 'Missing skill to fork.' });

    const payload: { scope: 'user'; new_name?: string } = { scope: 'user' };
    if (new_name) payload.new_name = new_name;

    const res = await lqFetch(event, `/api/v1/skills/${encodeURIComponent(skill_name)}/fork`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.status === 201) {
      const forked = (await res.json()) as { id?: string | null };
      throw redirect(303, forked.id ? `/skills/${forked.id}` : '/skills');
    }
    if (res.status === 409) return fail(409, { error: 'You already have a skill forked from this one.' });
    return fail(502, { error: 'Could not fork the skill.' });
  }
};
