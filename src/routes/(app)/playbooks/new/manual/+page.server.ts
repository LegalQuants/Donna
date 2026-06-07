import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { blankDraft, duplicateDraft } from '$lib/playbooks/editorDraft';
import type { Playbook, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const from = event.url.searchParams.get('from');
	if (from) {
		const res = await lqFetch(event, `/api/v1/playbooks/${from}`);
		if (res.ok) {
			const src = (await res.json()) as Playbook;
			return { initial: duplicateDraft(src) };
		}
	}
	return { initial: blankDraft() };
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
		const res = await lqFetch(event, '/api/v1/playbooks', {
			method: 'POST',
			body: JSON.stringify(draft)
		});
		if (res.status === 422)
			return fail(422, {
				error: 'The backend rejected the playbook. Check the fields and try again.'
			});
		if (!res.ok) return fail(502, { error: 'Could not save the playbook.' });
		const created = (await res.json()) as { id: string };
		throw redirect(303, `/playbooks/${created.id}`);
	}
};
