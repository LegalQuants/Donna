/**
 * Parse the one-shot `donna_draft_skills` cookie (a JSON array of skill slugs,
 * set by the landing `?/start` action) into a safe `string[]`. Tolerates a
 * missing or malformed cookie by returning an empty list.
 */
export function parseDraftSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}
