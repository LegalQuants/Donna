/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptRow from './PromptRow.svelte';

const prompt = { id: 'p1', name: 'Risk review', prompt_text: 'Review this contract for risk.', tags: ['legal'] } as never;

describe('PromptRow', () => {
  it('renders name, tag, and a preview', () => {
    render(PromptRow, { props: { prompt, onedit: vi.fn(), ondelete: vi.fn() } });
    expect(screen.getByText('Risk review')).toBeInTheDocument();
    expect(screen.getByText('legal')).toBeInTheDocument();
    expect(screen.getByText(/Review this contract/)).toBeInTheDocument();
  });
  it('fires onedit and ondelete', async () => {
    const onedit = vi.fn(); const ondelete = vi.fn();
    render(PromptRow, { props: { prompt, onedit, ondelete } });
    await fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onedit).toHaveBeenCalled();
    expect(ondelete).toHaveBeenCalled();
  });
});
