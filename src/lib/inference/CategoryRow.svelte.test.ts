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

  it('non-admin: renders the backing caption read-only (no select)', () => {
    render(CategoryRow, { props: { category, targets, isAdmin: false } as never });
    expect(screen.getByText(/Backed by Opus 4\.7/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
