import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('$app/state', () => ({ page: { data: { user: null } } }));

// modelStore.load() runs onMount and fetches; stub global fetch so it no-ops.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
import Composer from './Composer.svelte';
import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
import { createSkillAttach } from '$lib/skills/attach.svelte';

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

describe('Composer skill inputs', () => {
  const NDA = { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: '', scope: 'builtin', icon: null };

  it('renders a required skill input and gates Send until it is filled', async () => {
    const sa = createSkillAttach();
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'nda-review', required: [{ name: 'party', type: 'text', required: true }], optional: [] }), { status: 200 }));
    await sa.attach(NDA as never, f);
    render(Composer, { props: { value: 'hello', skillAttach: sa } as never });
    const party = screen.getByLabelText('party');
    expect(party).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await fireEvent.input(party, { target: { value: 'Acme' } });
    expect(send).toBeEnabled();
  });
});
