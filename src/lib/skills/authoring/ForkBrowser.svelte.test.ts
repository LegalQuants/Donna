/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ForkBrowser from './ForkBrowser.svelte';

type FailData = { error?: string };
type PostCb = (args: { result: { type: string; data?: FailData }; update: () => Promise<void> }) => Promise<void>;
type SubmitFn = () => PostCb;
const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
  enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
    hoisted.submit = submit;
    return {};
  }
}));
async function submitFailure(data: FailData) {
  const post = hoisted.submit!();
  await post({ result: { type: 'failure', data }, update: async () => {} });
}

const builtins = [
  { name: 'contract-review', title: 'Contract Review', version: '1', scope: 'builtin', description: 'Reviews contracts' },
  { name: 'nda-check', title: 'NDA Check', version: '1', scope: 'builtin' }
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(builtins), { status: 200 })));
});

describe('ForkBrowser', () => {
  it('fetches built-ins when opened and lists them', async () => {
    render(ForkBrowser, { props: { open: true, onclose: () => {} } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/skills/builtins'));
    expect(await screen.findByText('Contract Review')).toBeInTheDocument();
    expect(screen.getByText('NDA Check')).toBeInTheDocument();
  });

  it('filters the list by the search query', async () => {
    render(ForkBrowser, { props: { open: true, onclose: () => {} } });
    await screen.findByText('Contract Review');
    await fireEvent.input(screen.getByLabelText('Search built-in skills'), { target: { value: 'nda' } });
    expect(screen.queryByText('Contract Review')).not.toBeInTheDocument();
    expect(screen.getByText('NDA Check')).toBeInTheDocument();
  });

  it('opens a confirm form posting ?/fork with the chosen skill name', async () => {
    render(ForkBrowser, { props: { open: true, onclose: () => {} } });
    await screen.findByText('Contract Review');
    await fireEvent.click(screen.getByRole('button', { name: 'Fork Contract Review' }));
    const form = screen.getByRole('form', { name: 'Fork skill' });
    expect(form).toHaveAttribute('action', '?/fork');
    expect((form.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe('contract-review');
    expect((screen.getByLabelText('New name') as HTMLInputElement).value).toBe('Contract Review');
  });

  it('shows a fork error after a failed submit', async () => {
    render(ForkBrowser, { props: { open: true, onclose: () => {} } });
    await screen.findByText('Contract Review');
    await fireEvent.click(screen.getByRole('button', { name: 'Fork Contract Review' }));
    await submitFailure({ error: 'You already have a skill forked from this one.' });
    expect(await screen.findByText('You already have a skill forked from this one.')).toBeInTheDocument();
  });
});
