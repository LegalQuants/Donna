import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/knowledge-bases');
  if (!res.ok) throw error(502, 'Could not load knowledge bases.');
  const kbs = (await res.json()) as KnowledgeBase[];
  return { kbs };
};
