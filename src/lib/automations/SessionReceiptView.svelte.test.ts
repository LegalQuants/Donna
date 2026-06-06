/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionTimeline from './SessionTimeline.svelte';
import SessionReceiptHeader from './SessionReceiptHeader.svelte';
import type { SessionReceipt, SessionSummary } from './types';

const session: SessionSummary = {
  id: 's1', trigger_kind: 'schedule', current_phase: 'delivery', status: 'completed',
  halt_state: 'running', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-04T09:00:00Z', completed_at: '2026-06-04T09:04:00Z', last_activity_at: null, error: null
};
const receipt: SessionReceipt = {
  session_id: 's1', trigger_kind: 'schedule', status: 'completed', halt_state: 'running',
  current_phase: 'delivery', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-04T09:00:00Z', completed_at: '2026-06-04T09:04:00Z',
  phase_transitions: [{ to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' }],
  tool_calls: [{ tool: 'run_playbook', outcome: 'success', timestamp: '2026-06-04T09:01:00Z', cost_usd: 0.005 }],
  terminal_reason: 'completed'
};

describe('Session receipt view', () => {
  it('header shows status, cost vs cap, and terminal reason', () => {
    render(SessionReceiptHeader, { props: { session, receipt } });
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/\$0\.42 \/ \$2\.00 cap/)).toBeInTheDocument();
  });
  it('timeline renders merged phase and tool events', () => {
    render(SessionTimeline, { props: { receipt } });
    expect(screen.getByText(/phase: intake/)).toBeInTheDocument();
    expect(screen.getByText('run_playbook')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });
  it('timeline shows the degraded state for a null receipt', () => {
    render(SessionTimeline, { props: { receipt: null } });
    expect(screen.getByText(/receipt unavailable/i)).toBeInTheDocument();
  });
  it('timeline always renders the Activity heading', () => {
    render(SessionTimeline, { props: { receipt: null } });
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
  });
});
