/**
 * Parse the one-shot `donna_draft_skill_inputs` cookie / `?/start` form field
 * (a JSON object of `{ [skillSlug]: { [input]: value } }`) into a safe record.
 * Tolerates a missing or malformed value by returning `{}`, and drops any
 * entry whose value is not a plain object.
 */
export function parseDraftSkillInputs(raw: string | null | undefined): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [slug, vals] of Object.entries(parsed as Record<string, unknown>)) {
      if (vals && typeof vals === 'object' && !Array.isArray(vals)) out[slug] = vals as Record<string, unknown>;
    }
    return out;
  } catch {
    return {};
  }
}
