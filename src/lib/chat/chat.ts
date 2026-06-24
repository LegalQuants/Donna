// Defensive parser for the lq-ai Chat object. Donna only needs `sticky_skills` (the per-chat sticky
// set that drives the composer "Keep skills on" toggle). Drops malformed input rather than throwing;
// missing / non-array → []. Mirrors the parseXList precedent (findings.ts, artifacts.ts).
export function parseChat(raw: unknown): { stickySkills: string[] } {
	const obj =
		raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const arr = obj.sticky_skills;
	const stickySkills = Array.isArray(arr)
		? arr.filter((s): s is string => typeof s === 'string')
		: [];
	return { stickySkills };
}
