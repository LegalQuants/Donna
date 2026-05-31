import { describe, it, expect } from 'vitest';
import { blankPosition, blankDraft, normalizeDraft, duplicateDraft, linesToArray, arrayToLines, isValidDraft } from './editorDraft';
import type { Playbook, PlaybookCreate } from './types';

describe('editorDraft', () => {
  it('blankDraft has empty header and one blank position', () => {
    const d = blankDraft();
    expect(d.name).toBe('');
    expect(d.version).toBe('1.0.0');
    expect(d.positions).toHaveLength(1);
    expect(d.positions![0].severity_if_missing).toBe('medium');
    expect(d.positions![0].fallback_tiers).toEqual([]);
  });

  it('linesToArray trims and drops blanks; arrayToLines joins', () => {
    expect(linesToArray('a\n\n  b \nc')).toEqual(['a', 'b', 'c']);
    expect(arrayToLines(['a', 'b'])).toBe('a\nb');
    expect(arrayToLines(undefined)).toBe('');
  });

  it('normalizeDraft maps a Playbook to an editable PlaybookCreate (sorted, arrays/strings defaulted, no ids)', () => {
    const pb = {
      id: 'pb1', name: 'NDA', contract_type: 'NDA', version: '2.0.0', created_by: 'u1', created_at: '', updated_at: '',
      positions: [
        { id: 'p2', issue: 'Term', standard_language: 'L2', severity_if_missing: 'low', position_order: 1 },
        { id: 'p1', issue: 'Confidentiality', standard_language: 'L1', severity_if_missing: 'high', position_order: 0, detection_keywords: ['x'] }
      ]
    } as unknown as Playbook;
    const d = normalizeDraft(pb);
    expect(d.name).toBe('NDA');
    expect(d.positions!.map((p) => p.issue)).toEqual(['Confidentiality', 'Term']); // sorted by order
    expect(d.positions!.map((p) => p.position_order)).toEqual([0, 1]); // reseated
    expect((d.positions![0] as Record<string, unknown>).id).toBeUndefined(); // id stripped
    expect(d.positions![0].fallback_tiers).toEqual([]); // defaulted
    expect(d.positions![0].detection_keywords).toEqual(['x']);
  });

  it('duplicateDraft prefixes the name with "Copy of"', () => {
    const pb = { id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', created_by: null, created_at: '', updated_at: '', positions: [] } as unknown as Playbook;
    expect(duplicateDraft(pb).name).toBe('Copy of NDA-Mutual');
  });

  it('isValidDraft requires name, contract_type, >=1 position with issue + standard_language', () => {
    const ok: PlaybookCreate = { name: 'N', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'I', standard_language: 'L', severity_if_missing: 'high' }] };
    expect(isValidDraft(ok)).toBe(true);
    expect(isValidDraft({ ...ok, name: ' ' })).toBe(false);
    expect(isValidDraft({ ...ok, positions: [] })).toBe(false);
    expect(isValidDraft({ ...ok, positions: [{ issue: '', standard_language: 'L', severity_if_missing: 'high' }] })).toBe(false);
  });
});
