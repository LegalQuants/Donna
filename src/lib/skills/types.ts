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

/** The full skill-detail payload (built-in or resolved user/team skill),
 *  including the C5 tool_usage fields. Returned by /skills/{name}/contents. */
export type Skill = components['schemas']['Skill'];

/** Build the non-blocking "Uses: …" note for a skill's declared connectors (C5,
 *  PR6d). Returns null when nothing is declared. `unavailable` lists declared
 *  connectors not configured in this deployment (null ⇒ undeterminable ⇒ treated
 *  as available — informational, never gating). */
export function toolUsageNote(
	skill: Pick<Skill, 'tool_usage' | 'unavailable_tool_usage'>
): { text: string; unavailable: string[] } | null {
	const used = skill.tool_usage ?? [];
	if (used.length === 0) return null;
	return { text: `Uses: ${used.join(', ')}`, unavailable: skill.unavailable_tool_usage ?? [] };
}
