import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// modelStore.load() runs onMount and fetches; stub global fetch so it no-ops.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
import Composer from './Composer.svelte';
import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';

describe('Composer matter picker', () => {
  it('shows the matter picker only when matters are provided', async () => {
    const { rerender } = render(Composer, { props: {} });
    expect(screen.queryByRole('button', { name: /choose matter/i })).not.toBeInTheDocument();
    await rerender({ matters: [{ id: 'a', name: 'Acme MSA' }] });
    expect(screen.getByRole('button', { name: /choose matter/i })).toBeInTheDocument();
  });
});

describe('Composer prompt library', () => {
  it('inserts a saved prompt into the message at the cursor', async () => {
    const lib = createPromptLibrary();
    lib.seed([{ id: 'p1', name: 'Risk', prompt_text: 'INSERTED', tags: [] }] as never);
    render(Composer, { props: { value: '', promptLibrary: lib } as never });
    await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
    await fireEvent.click(screen.getByRole('button', { name: /insert Risk/i }));
    const message = document.querySelector('textarea.font-serif') as HTMLTextAreaElement;
    expect(message.value).toContain('INSERTED');
  });
});
