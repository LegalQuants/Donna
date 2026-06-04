// src/lib/automations/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { mergeTimeline } from './timeline';
import type { SessionReceipt } from './types';

const base: SessionReceipt = {
  session_id: 's1', trigger_kind: 'schedule', status: 'completed', halt_state: 'running',
  current_phase: 'delivery', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: null, completed_at: null, phase_transitions: [], tool_calls: [], terminal_reason: 'completed'
};

describe('mergeTimeline', () => {
  it('interleaves phases and tool calls in timestamp order', () => {
    const events = mergeTimeline({
      ...base,
      phase_transitions: [
        { to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' },
        { to_phase: 'analysis', timestamp: '2026-06-04T09:01:00Z' }
      ],
      tool_calls: [{ tool: 'kb.search', outcome: 'ok', timestamp: '2026-06-04T09:00:30Z', cost_usd: 0.01 }]
    });
    expect(events.map((e) => e.kind)).toEqual(['phase', 'tool', 'phase']);
    expect(events[0]).toMatchObject({ kind: 'phase', label: 'intake' });
    expect(events[1]).toMatchObject({ kind: 'tool', label: 'kb.search', outcome: 'ok', cost_usd: 0.01 });
  });

  it('keeps original order for events with null/equal timestamps (stable)', () => {
    const events = mergeTimeline({
      ...base,
      phase_transitions: [{ to_phase: 'intake', timestamp: null }, { to_phase: 'analysis', timestamp: null }],
      tool_calls: [{ tool: 'a', outcome: 'ok', timestamp: null, cost_usd: null }]
    });
    // phases first (added first), then the tool — stable for null timestamps
    expect(events.map((e) => e.label)).toEqual(['intake', 'analysis', 'a']);
  });

  it('returns [] for an empty receipt', () => {
    expect(mergeTimeline(base)).toEqual([]);
  });
});
