import type { components } from '$lib/api/backend';

/** A matter is a backend "project". */
export type Matter = components['schemas']['Project'];
export type MatterSummary = Pick<Matter, 'id' | 'name'>;

/** Drop the per-user sandbox project; the list/picker only show real matters. */
export function activeMatters(projects: Matter[]): Matter[] {
  return projects.filter((p) => !p.is_sandbox);
}

export function toSummary(m: Matter): MatterSummary {
  return { id: m.id, name: m.name };
}
