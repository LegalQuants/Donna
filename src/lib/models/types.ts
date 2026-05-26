/** A raw entry from GET /api/v1/models (gateway passthrough). `lq_ai_resolves_to`
 *  and `lq_ai_fallback_count` are present live but absent from the pinned OpenAPI,
 *  so we type them here rather than via `npm run gen:api`. */
export interface RawModelEntry {
  id: string;
  object: 'model';
  lq_ai_kind: 'alias' | 'provider_native';
  routed_inference_tier?: number;
  provider_type?: string;
  lq_ai_resolves_to?: string;
  lq_ai_fallback_count?: number;
}

export interface ModelsListResponse {
  object: 'list';
  data: RawModelEntry[];
}

/** A normalized, chat-usable alias for the picker. */
export interface ChatModelOption {
  id: string;
  /** Prettified resolved model, e.g. "Opus 4.7"; '' when unknown. */
  label: string;
  resolvedModel: string | null;
  group: 'cloud' | 'local';
  tier: number | null;
}
