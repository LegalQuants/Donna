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

  it('falls back to the parallel document_names map when a row name is missing', () => {
    const out = parseTabularResults(
      { rows: [{ document_id: 'd2', cells: {} }] },
      { d2: 'contract.pdf' }
    );
    expect(out?.rows[0].document_name).toBe('contract.pdf');
  });

  it('prefers the row name over the map, and the id when neither is present', () => {
    const out = parseTabularResults(
      { rows: [{ document_id: 'd1', document_name: 'real.pdf', cells: {} }, { document_id: 'd3', cells: {} }] },
      { d1: 'ignored.pdf' }
    );
    expect(out?.rows[0].document_name).toBe('real.pdf');
    expect(out?.rows[1].document_name).toBe('d3');
  });

  it('parses verification_method on a navigable citation (null when absent)', () => {
    const out = parseTabularResults({
      rows: [{ document_id: 'd1', cells: { Term: { value: 'x', confidence: 'high',
        cited_chunk_ids: ['c1'],
        citations: [
          { source_file_id: 'f1', source_page: 2, source_text: 'q', verification_method: 'ensemble_strict' },
          { source_file_id: 'f2', source_page: 1, source_text: 'r' }
        ] } } }]
    });
    const cites = out?.rows[0].cells.Term.citations;
    expect(cites?.[0].verification_method).toBe('ensemble_strict');
    expect(cites?.[1].verification_method).toBeNull();
  });

  it('narrows navigable citations off a cell', () => {
    const out = parseTabularResults({
      rows: [{ document_id: 'd1', cells: { Term: { value: 'x', confidence: 'high',
        cited_chunk_ids: ['c1'],
        citations: [{ source_file_id: 'file-1', source_page: 4, source_text: 'the clause', chunk_id: 'c1' },
                    { source_file_id: null, source_page: null, source_text: '' }] } } }]
    });
    const cits = out?.rows[0].cells.Term.citations;
    expect(cits).toEqual([{ source_file_id: 'file-1', source_page: 4, source_text: 'the clause', chunk_id: 'c1', document_id: undefined, verification_method: null }]);
  });
});
