import type { paths } from '$lib/api/backend';
import type { components } from '$lib/api/backend';

export type SkillInputDef = components['schemas']['SkillInputDef'];
export type SkillInputs = components['schemas']['SkillInputs'];

/** One autocomplete result, sourced from the generated backend contract. */
export type SkillSuggestion =
  paths['/api/v1/skills/autocomplete']['get']['responses']['200']['content']['application/json']['results'][number];

/** A skill the user has attached to the composer (the name we send + a label + its inputs). */
export interface AttachedSkill {
  slug: string;
  title: string;
  inputsLoading: boolean;
  inputsError: boolean;
  required: SkillInputDef[];
  optional: SkillInputDef[];
  values: Record<string, unknown>;
}
