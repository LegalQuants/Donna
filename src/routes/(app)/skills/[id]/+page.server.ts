import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { UserSkill, UserSkillUpdate } from '$lib/skills/authoring/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`);
	if (res.status === 404) throw error(404, 'Skill not found.');
	if (!res.ok) throw error(502, 'Could not load this skill.');
	const skill = (await res.json()) as UserSkill;
	return { skill };
};

export const actions: Actions = {
	save: async (event) => {
		const data = await event.request.formData();
		const display_name = String(data.get('display_name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const version = String(data.get('version') ?? '').trim();
		const body = String(data.get('body') ?? '');
		const tags = data.getAll('tags').map(String).filter(Boolean);
		const slashRaw = String(data.get('slash_alias') ?? '').trim();

		if (!display_name || !description || !body.trim())
			return fail(400, { error: 'Name, description, and body are required.' });

		const payload: UserSkillUpdate = {
			display_name,
			description,
			version,
			body,
			tags,
			slash_alias: slashRaw === '' ? null : slashRaw
		};

		const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload)
		});
		if (res.ok) return { success: true };
		if (res.status === 422) {
			const detail = await res.text();
			if (/slash_alias/i.test(detail))
				return fail(422, { field: 'slash_alias', error: 'That slash command is already in use.' });
			return fail(422, {
				error: 'The backend rejected your changes. Check the fields and try again.'
			});
		}
		if (res.status === 404) return fail(404, { error: 'This skill no longer exists.' });
		return fail(502, { error: 'Could not save the skill.' });
	},

	archive: async (event) => {
		const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`, {
			method: 'DELETE'
		});
		// 204 deleted; 410 Gone = already archived → both mean "it's gone", redirect to the list.
		if (res.ok || res.status === 410) throw redirect(303, '/skills');
		return fail(502, { error: 'Could not archive the skill.' });
	}
};
