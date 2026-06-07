import type { components } from '$lib/api/backend';

/** A matter is a backend "project". */
export type Matter = components['schemas']['Project'];
export type MatterSummary = Pick<Matter, 'id' | 'name'>;

/** Richer view for the chat header — carries privilege + tier-floor so the
 *  chat page can render the PrivilegedChip and pass minimumTier to ModelPicker. */
export interface MatterHeaderInfo {
	id: string;
	name: string;
	privileged: boolean;
	minimumTier: 1 | 2 | 3 | 4 | 5 | null;
}

/** Drop the per-user sandbox project; the list/picker only show real matters. */
export function activeMatters(projects: Matter[]): Matter[] {
	return projects.filter((p) => !p.is_sandbox);
}
