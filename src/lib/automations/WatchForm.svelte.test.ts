// src/lib/automations/WatchForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import WatchForm from './WatchForm.svelte';
import type { SourceItem } from './runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { MatterSummary } from '$lib/matters/types';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver', sub: 'builtin' }];
const kbs: KnowledgeBase[] = [{ id: 'kb1', name: 'Contracts KB', owner_id: 'u1', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
const matters: MatterSummary[] = [{ id: 'm1', name: 'Acme' }];
const base = { playbookItems, skillItems, kbs, matters };

// KbPicker renders a trigger button; KB rows appear after opening it.
async function pickKb(name: RegExp) {
  await fireEvent.click(screen.getByRole('button', { name: /choose a knowledge base/i }));
  await fireEvent.click(screen.getByRole('button', { name }));
}

describe('WatchForm', () => {
  it('states the per-arrival trigger and enables Save only after a source AND a KB', async () => {
    render(WatchForm, { props: base });
    expect(screen.getByText(/every time a new document is added/i)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /save watch/i });
    expect(save).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    expect(save).toBeDisabled(); // still needs a KB (required)
    await pickKb(/Contracts KB/);
    expect(save).not.toBeDisabled();
  });

  it('emits knowledge_base_id + playbook_id + enabled hidden inputs', async () => {
    const { container } = render(WatchForm, { props: base });
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    await pickKb(/Contracts KB/);
    expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe('p1');
    expect((container.querySelector('input[name="knowledge_base_id"]') as HTMLInputElement).value).toBe('kb1');
    expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe('true');
  });

  it('edit mode: KB read-only, matter + source/cost editable, "Save changes" label', () => {
    const { container } = render(WatchForm, {
      props: {
        ...base,
        submitLabel: 'Save changes',
        initial: { playbook_id: null, skill_ref: 'comms', knowledge_base_id: 'kb1', project_id: 'm1', max_cost_usd: '2.50', enabled: false }
      }
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled(); // seeded source + KB → savable
    expect(screen.getByRole('radio', { name: /skill/i })).toHaveAttribute('aria-checked', 'true'); // mode seeded from skill_ref
    expect(screen.getByText(/Watching: Contracts KB/i)).toBeInTheDocument(); // KB read-only
    // Matter is editable in edit mode (fc832ca); seeded selection shows on the trigger.
    expect(screen.getByRole('button', { name: 'Matter: Acme' })).toBeInTheDocument();
    expect(screen.queryByText(/set at creation/i)).toBeNull();
    expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('m1'); // seeded matter emitted
    expect(screen.queryByRole('button', { name: /choose a knowledge base/i })).toBeNull(); // no KB picker
    expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe('comms');
    expect((container.querySelector('input[name="knowledge_base_id"]') as HTMLInputElement).value).toBe('kb1');
    expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe('2.50');
  });

  it('edit mode emits an empty project_id when the seeded matter is cleared', async () => {
    const { container } = render(WatchForm, {
      props: {
        ...base,
        initial: { playbook_id: 'p1', skill_ref: null, knowledge_base_id: 'kb1', project_id: 'm1', max_cost_usd: null, enabled: true }
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Matter: Acme' }));
    await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
    expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('');
  });

  it('edit mode with no seeded matter still emits an empty project_id', () => {
    const { container } = render(WatchForm, {
      props: {
        ...base,
        initial: { playbook_id: 'p1', skill_ref: null, knowledge_base_id: 'kb1', project_id: null, max_cost_usd: null, enabled: true }
      }
    });
    expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('');
  });

  it('create mode omits the project_id hidden input until a matter is picked', () => {
    const { container } = render(WatchForm, { props: base });
    expect(container.querySelector('input[name="project_id"]')).toBeNull();
  });

  it('puts a typed cost cap into the hidden max_cost_usd input (string)', async () => {
    const { container } = render(WatchForm, { props: base });
    await fireEvent.input(screen.getByLabelText(/cost cap/i), { target: { value: '3.00' } });
    expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe('3.00');
  });
});
