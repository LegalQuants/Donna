// src/lib/automations/timeline.ts
import type { SessionReceipt } from './types';

export interface TimelineEvent {
  kind: 'phase' | 'tool';
  label: string;        // phase name or tool name
  outcome: string | null; // tool only
  cost_usd: number | null; // tool only
  timestamp: string | null;
  order: number;        // stable tiebreaker
}

/** Merge phase transitions and tool calls into one chronological stream.
 *  Stable: events with null/equal timestamps keep insertion order
 *  (phases inserted before tools). */
export function mergeTimeline(receipt: SessionReceipt): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let order = 0;
  for (const p of receipt.phase_transitions) {
    events.push({
      kind: 'phase',
      label: p.to_phase ?? 'unknown',
      outcome: null,
      cost_usd: null,
      timestamp: p.timestamp,
      order: order++
    });
  }
  for (const t of receipt.tool_calls) {
    events.push({
      kind: 'tool',
      label: t.tool ?? 'unknown',
      outcome: t.outcome,
      cost_usd: t.cost_usd,
      timestamp: t.timestamp,
      order: order++
    });
  }
  return events.sort((a, b) => {
    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
      return a.timestamp < b.timestamp ? -1 : 1;
    }
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return a.order - b.order;
  });
}
