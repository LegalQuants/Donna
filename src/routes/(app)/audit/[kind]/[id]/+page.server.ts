import { error } from '@sveltejs/kit';
import { canAudit } from '$lib/audit/gate';
import { lqFetch } from '$lib/server/lqClient';
import { parseLedger } from '$lib/fiduciary/ledger';
import type { PageServerLoad } from './$types';

const ENDPOINT: Record<string, (id: string) => string> = {
	chat: (id) => `/api/v1/chats/${id}/ledger`,
	session: (id) => `/api/v1/autonomous/sessions/${id}/ledger`
};

export const load: PageServerLoad = async (event) => {
	const { locals, params } = event;
	if (!canAudit(locals.user)) {
		throw error(403, 'Compliance review is available to auditor and admin roles only.');
	}
	const build = ENDPOINT[params.kind];
	if (!build) throw error(404, 'Unknown review target.');

	const res = await lqFetch(event, build(params.id));
	if (res.status === 404) throw error(404, 'Not found, or not accessible to your role.');
	if (!res.ok) throw error(502, 'Could not load the ledger.');

	const ledger = parseLedger(await res.json());
	return {
		kind: params.kind as 'chat' | 'session',
		id: params.id,
		ledger,
		role: locals.user?.role ?? 'auditor'
	};
};
