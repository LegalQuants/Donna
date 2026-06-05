// src/lib/automations/ScheduleRow.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ScheduleRow from './ScheduleRow.svelte';
import type { ScheduleSummary } from './schedules';

const schedule: ScheduleSummary = {
  id: 's1', name: 'Weekly summary', cron_expr: '0 9 * * 1',
  playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: null,
  max_cost_usd: null, enabled: true, next_run_at: '2026-06-08T09:00:00Z', last_run_at: null
};

describe('ScheduleRow', () => {
  it('shows the name, humanized cadence and source, and an On toggle', () => {
    const { container } = render(ScheduleRow, { props: { schedule, sourceLabel: 'NDA Review' } });
    expect(screen.getByText('Weekly summary')).toBeInTheDocument();
    expect(screen.getByText(/Every Monday at 9:00 · NDA Review/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^on$/i })).toBeInTheDocument();
    // toggle posts the NEGATED enabled value
    expect((container.querySelector('form[action="?/toggle"] input[name="enabled"]') as HTMLInputElement).value).toBe('false');
    expect((container.querySelector('form[action="?/toggle"] input[name="id"]') as HTMLInputElement).value).toBe('s1');
  });

  it('links to the edit page and reveals a delete form only after confirm', async () => {
    const { container } = render(ScheduleRow, { props: { schedule: { ...schedule, enabled: false }, sourceLabel: 'NDA Review' } });
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', '/automations/schedules/s1');
    expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
    // Delete is a two-step confirm: no submit form until the first click.
    expect(container.querySelector('form[action="?/delete"]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect((container.querySelector('form[action="?/delete"] input[name="id"]') as HTMLInputElement).value).toBe('s1');
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
  });

  it('uses the source label as the title and drops the duplicate when a schedule has no name', () => {
    render(ScheduleRow, { props: { schedule: { ...schedule, name: null }, sourceLabel: 'NDA Review' } });
    // Title falls back to the source; the subtitle is just the cadence (no second "NDA Review").
    expect(screen.getByText('NDA Review')).toBeInTheDocument();
    expect(screen.getByText(/^\s*Every Monday at 9:00\s*$/)).toBeInTheDocument();
  });
});
