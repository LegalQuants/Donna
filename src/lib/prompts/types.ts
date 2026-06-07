import type { components } from '$lib/api/backend';

export type SavedPrompt = components['schemas']['SavedPrompt'];

/** POST/PATCH body shape (the backend has no named Create/Update schema). */
export interface SavedPromptInput {
	name: string;
	prompt_text: string;
	tags?: string[];
}
