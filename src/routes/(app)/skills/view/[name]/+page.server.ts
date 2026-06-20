import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Skill } from '$lib/skills/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(
		event,
		`/api/v1/skills/${encodeURIComponent(event.params.name)}/contents`
	);
	if (res.status === 404) throw error(404, 'Skill not found.');
	if (!res.ok) throw error(502, 'Could not load this skill.');
	const skill = (await res.json()) as Skill;
	return { skill };
};
