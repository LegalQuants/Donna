import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { TabularExecution } from '$lib/tabular/types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/tabular/executions/${event.params.executionId}`);
	if (res.status === 404) throw error(404, 'Review not found.');
	if (!res.ok) throw error(502, 'Could not load this review.');
	const execution = (await res.json()) as TabularExecution;
	return { execution };
};
