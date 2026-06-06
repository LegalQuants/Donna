// src/lib/automations/runOutput.server.ts
// Server-side loader for a run's work-product (findings + proposed memories),
// shared by the [id] SSR load and the [id] poll proxy. Degrades each key to
// null on failure — the receipt page must never fail because of Results.
import { lqFetch } from '$lib/server/lqClient';
import { parseFindingList, parseRunMemories, type FindingItem, type RunMemoryItem } from './findings';
import type { RequestEvent } from '@sveltejs/kit';

export interface RunOutput {
  findings: FindingItem[] | null;
  findings_total: number | null;
  memories: RunMemoryItem[] | null;
}

export async function loadRunOutput(event: RequestEvent, sessionId: string): Promise<RunOutput> {
  const [fRes, mRes] = await Promise.all([
    lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/findings?limit=200`),
    lqFetch(event, `/api/v1/autonomous/memory?source_session_id=${encodeURIComponent(sessionId)}&limit=200`)
  ]);
  let findings: FindingItem[] | null = null;
  let findings_total: number | null = null;
  if (fRes.ok) {
    try {
      const parsed = parseFindingList(await fRes.json());
      findings = parsed.findings;
      findings_total = parsed.total;
    } catch {
      // non-JSON body → Results unavailable
    }
  }
  let memories: RunMemoryItem[] | null = null;
  if (mRes.ok) {
    try {
      memories = parseRunMemories(await mRes.json());
    } catch {
      // non-JSON body → sub-section hidden
    }
  }
  return { findings, findings_total, memories };
}
