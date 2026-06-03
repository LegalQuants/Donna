import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { TabularExecutionSummary } from '$lib/tabular/types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/tabular/executions?limit=50');
  if (!res.ok) throw error(502, 'Could not load your tabular reviews.');
  const executions = (await res.json()) as TabularExecutionSummary[];
  return { executions };
};
