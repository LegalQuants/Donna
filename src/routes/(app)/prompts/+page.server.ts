import { lqFetch } from '$lib/server/lqClient';
import type { SavedPrompt } from '$lib/prompts/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/saved-prompts');
  const prompts = res.ok ? ((await res.json()) as SavedPrompt[]) : [];
  return { prompts };
};
