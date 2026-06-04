import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CategoryRow from './CategoryRow.svelte';
import type { CategoryView, ModelTarget } from './types';

const category: CategoryView = { name: 'smart', backingLabel: 'Opus 4.7', currentTargetId: 'anthropic-prod/claude-opus-4-7', tier: 4, group: 'cloud' };
const targets: ModelTarget[] = [
  { id: 'anthropic-prod/claude-opus-4-7', provider: 'anthropic-prod', model: 'claude-opus-4-7', label: 'Opus 4.7', group: 'cloud', tier: 4 },
  { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 }
];

describe('CategoryRow', () => {
  it('admin: renders the category + its backing caption, and a model select with the current value', () => {
    render(CategoryRow, { props: { category, targets, isAdmin: true } as never });
    expect(screen.getByText('smart')).toBeInTheDocument();
    expect(screen.getByText(/Backed by Opus 4\.7/)).toBeInTheDocument(); // caption renders in admin mode too
    const select = screen.getByRole('combobox', { name: /model for smart/i }) as HTMLSelectElement;
    expect(select.value).toBe('anthropic-prod/claude-opus-4-7');
    expect(screen.getByRole('option', { name: 'llama3.1:8b' })).toBeInTheDocument();
  });

  it('admin: shows a disabled placeholder when the backing is not among the targets (stale)', () => {
    const stale: CategoryView = { name: 'smart', backingLabel: 'Retired Model', currentTargetId: 'gone-prod/retired-1', tier: 4, group: 'cloud' };
    render(CategoryRow, { props: { category: stale, targets, isAdmin: true } as never });
    const select = screen.getByRole('combobox', { name: /model for smart/i }) as HTMLSelectElement;
    // The select honestly reflects the stale backing rather than silently selecting the first real option.
    expect(select.value).toBe('gone-prod/retired-1');
    const placeholder = screen.getByRole('option', { name: /Retired Model \(unavailable\)/i }) as HTMLOptionElement;
    expect(placeholder.disabled).toBe(true);
  });

  it('non-admin: renders the backing caption read-only (no select)', () => {
    render(CategoryRow, { props: { category, targets, isAdmin: false } as never });
    expect(screen.getByText(/Backed by Opus 4\.7/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
