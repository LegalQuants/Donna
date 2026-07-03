import { error } from '@sveltejs/kit';
import { canAudit } from '$lib/audit/gate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canAudit(locals.user)) {
		throw error(403, 'Compliance review is available to auditor and admin roles only.');
	}
	return {};
};
