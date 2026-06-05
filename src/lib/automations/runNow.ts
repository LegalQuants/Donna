export type SourceMode = 'playbook' | 'skill';

/** One selectable run-now source (a playbook or a skill). */
export interface SourceItem {
  value: string; // playbook id, or skill slug/name (the run-now playbook_id | skill_ref)
  label: string;
  sub?: string;
}

interface PlaybookLike { id: string; name: string; contract_type?: string }
interface UserSkillLike { slug: string; display_name: string; description?: string }
interface BuiltinSkillLike { name: string; title: string; description?: string }

export function toPlaybookItems(playbooks: PlaybookLike[]): SourceItem[] {
  if (!Array.isArray(playbooks)) return [];
  return playbooks.map((p) => ({ value: p.id, label: p.name, sub: p.contract_type }));
}

export function toSkillItems(userSkills: UserSkillLike[], builtins: BuiltinSkillLike[]): SourceItem[] {
  const u = Array.isArray(userSkills) ? userSkills : [];
  const b = Array.isArray(builtins) ? builtins : [];
  const seen = new Set(u.map((s) => s.slug));
  return [
    ...u.map((s) => ({ value: s.slug, label: s.display_name, sub: s.description })),
    ...b.filter((s) => !seen.has(s.name)).map((s) => ({ value: s.name, label: s.title, sub: s.description }))
  ];
}
