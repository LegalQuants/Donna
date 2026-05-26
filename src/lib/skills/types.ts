import type { paths } from '$lib/api/backend';

/** One autocomplete result, sourced from the generated backend contract. */
export type SkillSuggestion =
  paths['/api/v1/skills/autocomplete']['get']['responses']['200']['content']['application/json']['results'][number];

/** A skill the user has attached to the composer (the name we send + a label). */
export interface AttachedSkill {
  slug: string;
  title: string;
}
