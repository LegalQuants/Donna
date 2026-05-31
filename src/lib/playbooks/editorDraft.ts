import type { Playbook, PlaybookCreate, PositionCreate } from './types';

export function blankPosition(order = 0): PositionCreate {
  return {
    issue: '',
    description: '',
    standard_language: '',
    fallback_tiers: [],
    redline_strategy: '',
    severity_if_missing: 'medium',
    detection_keywords: [],
    detection_examples: [],
    position_order: order
  };
}

export function blankDraft(): PlaybookCreate {
  return { name: '', contract_type: '', description: '', version: '1.0.0', positions: [blankPosition(0)] };
}

/** Map a loaded Playbook (or a raw PlaybookCreate) to a clean, editable
 *  PlaybookCreate: positions sorted by order then reseated 0..n, server ids
 *  dropped, optional arrays/strings defaulted so the editor can bind safely. */
export function normalizeDraft(src: PlaybookCreate | Playbook): PlaybookCreate {
  const positions = [...(src.positions ?? [])]
    .sort((a, b) => (a.position_order ?? 0) - (b.position_order ?? 0))
    .map((p, i): PositionCreate => ({
      issue: p.issue,
      description: p.description ?? '',
      standard_language: p.standard_language,
      fallback_tiers: (p.fallback_tiers ?? []).map((t) => ({ rank: t.rank, description: t.description, language: t.language })),
      redline_strategy: p.redline_strategy ?? '',
      severity_if_missing: p.severity_if_missing,
      detection_keywords: [...(p.detection_keywords ?? [])],
      detection_examples: [...(p.detection_examples ?? [])],
      position_order: i
    }));
  return {
    name: src.name,
    contract_type: src.contract_type,
    description: src.description ?? '',
    version: src.version ?? '1.0.0',
    positions
  };
}

/** A create-draft prefilled from an existing playbook (Duplicate). */
export function duplicateDraft(src: Playbook): PlaybookCreate {
  return { ...normalizeDraft(src), name: `Copy of ${src.name}` };
}

export function linesToArray(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

export function arrayToLines(arr: string[] | undefined): string {
  return (arr ?? []).join('\n');
}

export function isPositionValid(p: PositionCreate): boolean {
  return !!p.issue?.trim() && !!p.standard_language?.trim() && !!p.severity_if_missing;
}

export function isValidDraft(d: PlaybookCreate): boolean {
  if (!d.name?.trim() || !d.contract_type?.trim()) return false;
  const positions = d.positions ?? [];
  if (positions.length === 0) return false;
  return positions.every(isPositionValid);
}
