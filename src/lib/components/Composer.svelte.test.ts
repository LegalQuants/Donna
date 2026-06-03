import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('$app/state', () => ({ page: { data: { user: null } } }));

// modelStore.load() runs onMount and fetches; stub global fetch so it no-ops.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
import Composer from './Composer.svelte';
import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
import { createSkillAttach } from '$lib/skills/attach.svelte';
import { createFileAttach } from '$lib/files/fileAttach.svelte';

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

describe('Composer file attach', () => {
  const fileRes = (status: string) =>
    new Response(JSON.stringify({ id: 'f1', filename: 'a.txt', ingestion_status: status }), { status: 201 });

  it('renders the paperclip attach button when fileAttach is provided', () => {
    const fa = createFileAttach();
    render(Composer, { props: { value: '', fileAttach: fa } as never });
    expect(screen.getByTestId('file-attach')).toBeInTheDocument();
  });

  it('shows a ready file chip and keeps Send enabled', async () => {
    const fa = createFileAttach();
    await fa.attach([new File(['x'], 'a.txt')], vi.fn().mockResolvedValue(fileRes('ready')));
    render(Composer, { props: { value: 'hello', fileAttach: fa } as never });
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('disables Send when an attached file failed', async () => {
    const fa = createFileAttach();
    await fa.attach([new File(['x'], 'a.txt')], vi.fn().mockResolvedValue(new Response('no', { status: 413 })));
    render(Composer, { props: { value: 'hello', fileAttach: fa } as never });
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
