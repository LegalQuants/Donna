import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { EasyPlaybookGeneration, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

type MatterSummary = { id: string; name: string };
type IngestedFile = { id: string; filename: string; document_id: string };

export const load: PageServerLoad = async (event) => {
	const mRes = await lqFetch(event, '/api/v1/projects');
	const matters = (mRes.ok ? ((await mRes.json()) as MatterSummary[]) : []).map((m) => ({
		id: m.id,
		name: m.name
	}));

	let matterFiles: IngestedFile[] = [];
	const matterId = event.url.searchParams.get('matter');
	if (matterId) {
		const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
		if (projRes.ok) {
			const proj = (await projRes.json()) as { attached_file_ids?: string[] };
			const files = await Promise.all(
				(proj.attached_file_ids ?? []).map(async (fid) => {
					const r = await lqFetch(event, `/api/v1/files/${fid}`);
					return r.ok
						? ((await r.json()) as {
								id: string;
								filename: string;
								ingestion_status?: string;
								document_id?: string | null;
							})
						: null;
				})
			);
			matterFiles = files
				.filter(
					(f): f is NonNullable<typeof f> =>
						f !== null && f.ingestion_status === 'ready' && !!f.document_id
				)
				.map((f) => ({ id: f.id, filename: f.filename, document_id: f.document_id as string }));
		}
	}

	let generation: EasyPlaybookGeneration | null = null;
	const genId = event.url.searchParams.get('generation');
	if (genId) {
		const gRes = await lqFetch(event, `/api/v1/playbooks/easy/${genId}`);
		if (gRes.ok) generation = (await gRes.json()) as EasyPlaybookGeneration;
	}

	return { matters, matterFiles, generation };
};

export const actions: Actions = {
	save: async (event) => {
		const data = await event.request.formData();
		let draft: PlaybookCreate;
		try {
			draft = JSON.parse(String(data.get('draft') ?? '')) as PlaybookCreate;
		} catch {
			return fail(400, { error: 'Could not read the draft.' });
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
