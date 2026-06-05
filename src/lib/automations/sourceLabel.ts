// Shared source-label resolver for schedules and watches (both reference a
// playbook or a skill). Keyed on a minimal structural shape so any summary works.
import type { SourceItem } from './runNow';

export interface SourceRef {
  playbook_id: string | null;
  skill_ref: string | null;
}

/** Human label for a source, resolved against the loaded libraries. */
export function sourceLabel(s: SourceRef, playbookItems: SourceItem[], skillItems: SourceItem[]): string {
  if (s.playbook_id) return playbookItems.find((i) => i.value === s.playbook_id)?.label ?? 'Playbook';
  if (s.skill_ref) return skillItems.find((i) => i.value === s.skill_ref)?.label ?? s.skill_ref;
  return '—';
}
