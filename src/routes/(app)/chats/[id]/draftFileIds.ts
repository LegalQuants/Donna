/**
 * Parse the one-shot `donna_draft_file_ids` cookie / `?/start` form field (a JSON
 * array of file UUIDs set by the landing `?/start` action) into a safe `string[]`.
 * Tolerates a missing or malformed value by returning an empty list. (Mirrors
 * `parseDraftSkills`.)
 */
export function parseDraftFileIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}
