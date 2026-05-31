/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptModal from './PromptModal.svelte';
import type { SavedPromptInput } from './types';

describe('PromptModal', () => {
  it('create mode: submitting emits the entered values', async () => {
    const onsave = vi.fn<(input: SavedPromptInput) => Promise<boolean>>(() => Promise.resolve(true));
    render(PromptModal, { props: { open: true, onsave, onclose: vi.fn() } });
    await fireEvent.input(screen.getByLabelText(/name/i), { target: { value: 'My prompt' } });
    await fireEvent.input(screen.getByLabelText(/prompt text/i), { target: { value: 'Do the thing.' } });
    await fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onsave.mock.calls.at(-1)![0]).toMatchObject({ name: 'My prompt', prompt_text: 'Do the thing.' });
  });

  it('edit mode: seeds fields from the prompt', () => {
    render(PromptModal, { props: { open: true, prompt: { id: 'p1', name: 'Seed', prompt_text: 'Body', tags: ['t'] } as never, onsave: vi.fn(() => Promise.resolve(true)), onclose: vi.fn() } });
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Seed');
    expect((screen.getByLabelText(/prompt text/i) as HTMLTextAreaElement).value).toBe('Body');
  });

  it('disables Save when name or prompt text is empty', () => {
    render(PromptModal, { props: { open: true, onsave: vi.fn(() => Promise.resolve(true)), onclose: vi.fn() } });
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
