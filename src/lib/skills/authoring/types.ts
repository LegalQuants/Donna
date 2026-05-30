import type { components } from '$lib/api/backend';

/** Rich management view of an editable skill (includes body + frontmatter_extra). */
export type UserSkill = components['schemas']['UserSkill'];
/** Create payload for POST /api/v1/user-skills. */
export type UserSkillCreate = components['schemas']['UserSkillCreate'];
/** Patch payload for PATCH /api/v1/user-skills/{skill_id}. */
export type UserSkillUpdate = components['schemas']['UserSkillUpdate'];
/** Picker/summary shape (built-ins list, fork source). Uses `name` + `title`. */
export type SkillSummary = components['schemas']['SkillSummary'];
