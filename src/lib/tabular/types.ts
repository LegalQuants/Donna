import type { components } from '$lib/api/backend';

/** Ad-hoc column spec sent to the backend (name + query; advanced fields deferred to Slice C). */
export type ColumnSpec = components['schemas']['ColumnSpec'];
export type TabularExecution = components['schemas']['TabularExecution'];
export type TabularExecutionCreate = components['schemas']['TabularExecutionCreate'];
export type TabularPreviewCostRequest = components['schemas']['TabularPreviewCostRequest'];
export type TabularPreviewCostResponse = components['schemas']['TabularPreviewCostResponse'];

/** Compact projection from the list endpoint (no inlined results). */
export type TabularExecutionSummary = components['schemas']['TabularExecutionSummary'];

/** A registered `output_format: table` skill, as surfaced to the builder's picker. */
export interface TableSkillSummary {
  name: string;
  title: string;
  description?: string | null;
}

/** Terminal execution statuses (no more polling once reached). */
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export type ExecutionStatus = TabularExecution['status'];

export function isTerminal(status: ExecutionStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Per-cell confidence from the m3-c2-v1 results grid. */
export type CellConfidence = 'high' | 'medium' | 'low' | 'failed';

/** Read-time-resolved navigable citation on a tabular cell (DE-330: not yet in the generated schema). */
export interface TabularCitation {
  source_file_id: string;
  source_page: number | null;
  source_text: string;
  document_id?: string;
  chunk_id?: string;
  verification_method?: string | null;
}

export interface TabularCell {
  value: string;
  cited_chunk_ids: string[];
  confidence: CellConfidence;
  error?: string | null;
  citations: TabularCitation[];
}

export interface TabularRow {
  document_id: string;
  document_name: string;
  cells: Record<string, TabularCell>;
}

export interface TabularResults {
  schema_version: string;
  rows: TabularRow[];
  summary: { total_cells: number; failed_cells: number };
}

/** A document selected as a grid row (resolved to its parsed-content document_id). */
export interface SelectedDoc {
  document_id: string;
  name: string;
}

/** An in-progress ad-hoc column in the builder. */
export interface ColumnDraft {
  id: string;
  name: string;
  query: string;
  minimum_inference_tier?: number | null;
  ensemble_verification?: boolean | null;
}

/**
 * Narrow the loosely-typed `TabularExecution.results` ({ [k]: unknown }) into a
 * typed grid, or null if the payload is missing/malformed. Tolerant: filters out
 * non-object rows and coerces missing cell fields to safe defaults.
 */
export function parseTabularResults(
  raw: unknown,
  documentNamesById?: Record<string, string>
): TabularResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rows)) return null;
  const rows: TabularRow[] = [];
  for (const row of r.rows) {
    if (!row || typeof row !== 'object') continue;
    const ro = row as Record<string, unknown>;
    if (typeof ro.document_id !== 'string') continue;
    const cellsIn = ro.cells && typeof ro.cells === 'object' ? (ro.cells as Record<string, unknown>) : {};
    const cells: Record<string, TabularCell> = {};
    for (const [col, c] of Object.entries(cellsIn)) {
      const co = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      const confidence = (['high', 'medium', 'low', 'failed'].includes(co.confidence as string)
        ? (co.confidence as CellConfidence)
        : 'failed') as CellConfidence;
      cells[col] = {
        value: typeof co.value === 'string' ? co.value : '',
        cited_chunk_ids: Array.isArray(co.cited_chunk_ids)
          ? co.cited_chunk_ids.filter((x): x is string => typeof x === 'string')
          : [],
        confidence,
        error: typeof co.error === 'string' ? co.error : null,
        citations: Array.isArray(co.citations)
          ? co.citations.flatMap((c): TabularCitation[] => {
              const cc = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
              if (typeof cc.source_file_id !== 'string') return [];
              return [{
                source_file_id: cc.source_file_id,
                source_page: typeof cc.source_page === 'number' ? cc.source_page : null,
                source_text: typeof cc.source_text === 'string' ? cc.source_text : '',
                document_id: typeof cc.document_id === 'string' ? cc.document_id : undefined,
                chunk_id: typeof cc.chunk_id === 'string' ? cc.chunk_id : undefined,
                verification_method: typeof cc.verification_method === 'string' ? cc.verification_method : null
              }];
            })
          : []
      };
    }
    rows.push({
      document_id: ro.document_id,
      document_name:
        typeof ro.document_name === 'string'
          ? ro.document_name
          : (documentNamesById?.[ro.document_id] ?? ro.document_id),
      cells
    });
  }
  const summaryIn = (r.summary && typeof r.summary === 'object' ? r.summary : {}) as Record<string, unknown>;
  return {
    schema_version: typeof r.schema_version === 'string' ? r.schema_version : '',
    rows,
    summary: {
      total_cells: typeof summaryIn.total_cells === 'number' ? summaryIn.total_cells : 0,
      failed_cells: typeof summaryIn.failed_cells === 'number' ? summaryIn.failed_cells : 0
    }
  };
}
