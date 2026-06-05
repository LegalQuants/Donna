// src/lib/automations/ScheduleForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ScheduleForm from './ScheduleForm.svelte';
import type { SourceItem } from './runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { MatterSummary } from '$lib/matters/types';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver', sub: 'builtin' }];
const kbs: KnowledgeBase[] = [{ id: 'kb1', name: 'Contracts KB', owner_id: 'u1', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
const matters: MatterSummary[] = [{ id: 'm1', name: 'Acme' }];

const base = { playbookItems, skillItems, kbs, matters };

describe('ScheduleForm', () => {
  it('enables Save only once a source is chosen and the cron is valid', async () => {
    render(ScheduleForm, { props: base });
    const save = screen.getByRole('button', { name: /save schedule/i });
    expect(save).toBeDisabled(); // default cron is valid, but no source yet
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    expect(save).not.toBeDisabled();
  });

  it('emits playbook_id + cron_expr + enabled hidden inputs', async () => {
    const { container } = render(ScheduleForm, { props: base });
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe('p1');
    expect((container.querySelector('input[name="cron_expr"]') as HTMLInputElement).value).toBe('0 9 * * *');
    expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe('true');
    expect(container.querySelector('input[name="skill_ref"]')).toBeNull();
  });

  it('prefills from initial in edit mode (skill source) and shows the given submit label', () => {
    const { container } = render(ScheduleForm, {
      props: {
        ...base,
        submitLabel: 'Save changes',
        initial: { name: 'Weekly', cron_expr: '0 9 * * 1', playbook_id: null, skill_ref: 'comms', target_kb_id: 'kb1', project_id: null, max_cost_usd: '2.50', enabled: false }
      }
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /skill/i })).toHaveAttribute('aria-checked', 'true');
    expect((container.querySelector('input[name="cron_expr"]') as HTMLInputElement).value).toBe('0 9 * * 1');
    expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe('comms');
    expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe('false');
    expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe('2.50');
  });
});
