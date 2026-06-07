import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { normalizeDraft } from '$lib/playbooks/editorDraft';
import type { Playbook, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
	if (res.status === 404) throw error(404, 'Playbook not found.');
	if (!res.ok) throw error(502, 'Could not load this playbook.');
	const playbook = (await res.json()) as Playbook;
	const isOwner = !!playbook.created_by && playbook.created_by === event.locals?.user?.id;
	if (!isOwner) throw error(403, 'You can only edit playbooks you own.');
	return { id: playbook.id, name: playbook.name, initial: normalizeDraft(playbook) };
};

export const actions: Actions = {
	save: async (event) => {
		const data = await event.request.formData();
		let draft: PlaybookCreate;
		try {
			draft = JSON.parse(String(data.get('draft') ?? '')) as PlaybookCreate;
		} catch {
			return fail(400, { error: 'Could not read the playbook.' });
		}
		if (!draft.name?.trim() || !draft.contract_type?.trim() || !draft.positions?.length) {
			return fail(400, { error: 'A name, contract type, and at least one position are required.' });
		}
		const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`, {
			method: 'PATCH',
			body: JSON.stringify(draft)
		});
		if (res.status === 403) return fail(403, { error: 'You can only edit playbooks you own.' });
		if (res.status === 422)
			return fail(422, {
				error: 'The backend rejected the playbook. Check the fields and try again.'
			});
		if (!res.ok) return fail(502, { error: 'Could not save the playbook.' });
		throw redirect(303, `/playbooks/${event.params.id}`);
	}
};
