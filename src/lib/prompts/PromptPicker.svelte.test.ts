/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptPicker from './PromptPicker.svelte';
import type { SavedPromptInput } from './types';

const prompts = [
  { id: 'p1', name: 'Risk review', prompt_text: 'Review for risk.', tags: ['legal'] },
  { id: 'p2', name: 'Summarize', prompt_text: 'Summarize this.', tags: [] }
] as never[];

function open() {
  const onopen = vi.fn(); const oninsert = vi.fn(); const onsave = vi.fn<(input: SavedPromptInput) => Promise<boolean>>(() => Promise.resolve(true));
  render(PromptPicker, { props: { prompts, loading: false, error: null, draft: 'my draft', onopen, oninsert, onsave } });
  return { onopen, oninsert, onsave };
}

describe('PromptPicker', () => {
  it('opening calls onopen and lists prompts', async () => {
    const { onopen } = open();
    await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
    expect(onopen).toHaveBeenCalled();
    expect(screen.getByText('Risk review')).toBeInTheDocument();
    expect(screen.getByText('Summarize')).toBeInTheDocument();
  });
  it('search filters the list', async () => {
    open();
    await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'risk' } });
    expect(screen.getByText('Risk review')).toBeInTheDocument();
    expect(screen.queryByText('Summarize')).not.toBeInTheDocument();
  });
  it('clicking a prompt inserts its text', async () => {
    const { oninsert } = open();
    await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
    await fireEvent.click(screen.getByRole('button', { name: /insert Risk review/i }));
    expect(oninsert).toHaveBeenCalledWith('Review for risk.');
  });
  it('save-current-draft sends the draft as prompt_text', async () => {
    const { onsave } = open();
    await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
    await fireEvent.click(screen.getByRole('button', { name: /save current draft/i }));
    await fireEvent.input(screen.getByPlaceholderText(/name this prompt/i), { target: { value: 'My draft prompt' } });
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onsave.mock.calls.at(-1)![0]).toMatchObject({ name: 'My draft prompt', prompt_text: 'my draft' });
  });
});
