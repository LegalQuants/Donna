import { describe, it, expect } from 'vitest';
import { parseTabularResults, isTerminal } from './types';

describe('isTerminal', () => {
  it('is true for completed/failed/cancelled and false otherwise', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('pending')).toBe(false);
  });
});

describe('parseTabularResults', () => {
  it('returns null for null/non-object/missing rows', () => {
    expect(parseTabularResults(null)).toBeNull();
    expect(parseTabularResults('x')).toBeNull();
    expect(parseTabularResults({})).toBeNull();
  });

  it('parses a well-formed grid', () => {
    const out = parseTabularResults({
      schema_version: 'm3-c2-v1',
      rows: [
        {
          document_id: 'd1',
          document_name: 'a.pdf',
          cells: {
            Term: { value: '3 years', cited_chunk_ids: ['c1', 'c2'], confidence: 'high', error: null }
          }
        }
      ],
      summary: { total_cells: 1, failed_cells: 0 }
    });
    expect(out?.rows[0].document_name).toBe('a.pdf');
    expect(out?.rows[0].cells.Term.value).toBe('3 years');
    expect(out?.rows[0].cells.Term.cited_chunk_ids).toEqual(['c1', 'c2']);
    expect(out?.summary).toEqual({ total_cells: 1, failed_cells: 0 });
  });

  it('coerces malformed cells and defaults document_name to the id', () => {
    const out = parseTabularResults({
      rows: [{ document_id: 'd2', cells: { Col: { confidence: 'nope' } } }]
    });
    expect(out?.rows[0].document_name).toBe('d2');
    expect(out?.rows[0].cells.Col.value).toBe('');
    expect(out?.rows[0].cells.Col.cited_chunk_ids).toEqual([]);
    expect(out?.rows[0].cells.Col.confidence).toBe('failed');
    expect(out?.summary).toEqual({ total_cells: 0, failed_cells: 0 });
  });

  it('drops rows without a string document_id', () => {
    const out = parseTabularResults({ rows: [{ cells: {} }, { document_id: 'ok', cells: {} }] });
    expect(out?.rows.length).toBe(1);
    expect(out?.rows[0].document_id).toBe('ok');
  });
});
