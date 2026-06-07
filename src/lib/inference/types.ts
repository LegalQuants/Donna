import type { components } from '$lib/api/backend';

export type AdminAliasEntry = components['schemas']['AdminAliasEntry'];
export type AdminAliasFallback = components['schemas']['AdminAliasFallback'];
export type AdminAliasUpdate = components['schemas']['AdminAliasUpdate'];
export type TierConfigResponse = components['schemas']['TierConfigResponse'];

/** An assignable concrete model (a provider-native entry from GET /models). */
export interface ModelTarget {
	id: string; // "provider/model" (the GET /models id)
	provider: string;
	model: string;
	label: string;
	group: 'cloud' | 'local';
	tier: number | null;
}

/** A view of one inference category (alias) for the settings rows. */
export interface CategoryView {
	name: string; // e.g. "smart"
	backingLabel: string; // e.g. "Opus 4.7"
	currentTargetId: string | null; // "provider/model" of the current backing
	tier: number | null;
	group: 'cloud' | 'local';
}
