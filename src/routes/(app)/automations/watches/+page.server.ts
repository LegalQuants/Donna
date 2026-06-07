import { fail, error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseWatchList, buildWatchBody } from '$lib/automations/watches';
import { jsonOr } from '$lib/server/loadJson';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const autonomousEnabled = await isAutonomousEnabled(event);
	if (!autonomousEnabled) {
		return {
			autonomousEnabled,
			unread: 0,
			watches: [],
			playbookItems: [],
			skillItems: [],
			kbs: [],
			matters: []
		};
	}

	const [unread, watchesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] =
		await Promise.all([
			unreadCount(event),
			lqFetch(event, '/api/v1/autonomous/watches'),
			lqFetch(event, '/api/v1/playbooks'),
			lqFetch(event, '/api/v1/user-skills?scope=user'),
			lqFetch(event, '/api/v1/skills?scope=builtin'),
			lqFetch(event, '/api/v1/knowledge-bases'),
			lqFetch(event, '/api/v1/projects')
		]);
	if (!watchesRes.ok) throw error(502, 'Could not load watches.');

	const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(
		playbooksRes,
		[]
	);
	const userSkills = (
		await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, [])
	).filter((s) => Boolean(s.slug));
	const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(
		builtinsRes,
		[]
	);
	const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
	const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

	return {
		autonomousEnabled,
		unread,
		watches: parseWatchList(await watchesRes.json()),
		playbookItems: toPlaybookItems(playbooks),
		skillItems: toSkillItems(userSkills, builtins),
		kbs,
		matters: matters.map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const built = buildWatchBody(await event.request.formData(), 'create');
		if (!built.ok) return fail(400, { error: 'Choose a source and a knowledge base to watch.' });
		const res = await lqFetch(event, '/api/v1/autonomous/watches', {
			method: 'POST',
			body: JSON.stringify(built.body)
		});
		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: "That knowledge base isn't available." });
		if (res.status === 422)
			return fail(422, { error: 'Choose exactly one of a playbook or a skill.' });
		if (!res.ok) return fail(502, { error: 'Could not save the watch.' });
		return { created: true };
	},
	toggle: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const enabled = String(form.get('enabled') ?? '') === 'true';
		if (!id) return fail(400, { error: 'Missing watch id.' });
		const res = await lqFetch(event, `/api/v1/autonomous/watches/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ enabled })
		});
		if (!res.ok)
			return fail(res.status === 403 ? 403 : 502, { error: 'Could not update the watch.' });
		return { toggled: true };
	},
	delete: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing watch id.' });
		const res = await lqFetch(event, `/api/v1/autonomous/watches/${id}`, { method: 'DELETE' });
		if (!res.ok)
			return fail(res.status === 403 ? 403 : 502, { error: 'Could not delete the watch.' });
		return { deleted: true };
	}
};
