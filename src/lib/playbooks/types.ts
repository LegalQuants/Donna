import type { components } from '$lib/api/backend';

export type Playbook = components['schemas']['Playbook'];
export type Position = components['schemas']['Position'];
export type FallbackTier = components['schemas']['FallbackTier'];

export type PlaybookExecution = components['schemas']['PlaybookExecution'];

export type Verdict = 'matches_standard' | 'matches_fallback' | 'deviates' | 'missing';

export interface Redline {
  new_text: string;
  old_text: string;
  justification: string;
}

export interface PositionResult {
  issue: string;
  position_id: string;
  severity_if_missing: Position['severity_if_missing'];
  verdict: Verdict;
  confidence: number;
  matched_text: string | null;
  matched_fallback_rank: number | null;
  justification: string;
  redline: Redline | null;
  cited_chunk_ids: string[];
}

export interface ResultSummary {
  matches_standard: number;
  matches_fallback: number;
  deviates: number;
  missing: number;
}

/** The `PlaybookExecution.results` payload (schema `m3-a2-v1`). Hand-typed:
 *  the generated contract types `results` loosely as `{ [k]: unknown }`. */
export interface ExecutionResults {
  schema_version: string;
  summary: ResultSummary;
  positions: PositionResult[];
}
