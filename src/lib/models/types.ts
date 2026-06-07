import type { paths } from '$lib/api/backend';

/** The `GET /api/v1/models` 200 body, sourced directly from the generated
 *  backend contract (lq-ai #105 documents `lq_ai_resolves_to` /
 *  `lq_ai_fallback_count`, so no hand-typed extension is needed). */
export type ModelsListResponse =
	paths['/api/v1/models']['get']['responses']['200']['content']['application/json'];

/** One raw model entry (alias or provider-native) from that response. */
export type RawModelEntry = ModelsListResponse['data'][number];

/** A normalized, chat-usable alias for the picker. */
export interface ChatModelOption {
	id: string;
	/** Prettified resolved model, e.g. "Opus 4.7"; '' when unknown. */
	label: string;
	resolvedModel: string | null;
	group: 'cloud' | 'local';
	tier: number | null;
}
