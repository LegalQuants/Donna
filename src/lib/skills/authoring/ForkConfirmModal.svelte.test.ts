/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ForkConfirmModal from './ForkConfirmModal.svelte';

type FailData = { error?: string };
type PostCb = (args: { result: { type: string; data?: FailData }; update: () => Promise<void> }) => Promise<void>;
type SubmitFn = () => PostCb;
const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
  enhance: (_node: HTMLFormElement, submit: SubmitFn) => { hoisted.submit = submit; return {}; }
}));
async function submitFailure(data: FailData) {
  const post = hoisted.submit!();
  await post({ result: { type: 'failure', data }, update: async () => {} });
}

const skill = { name: 'contract-review', title: 'Contract Review', version: '1', scope: 'builtin' as const };

describe('ForkConfirmModal', () => {
  it('does not render when closed', () => {
    render(ForkConfirmModal, { props: { open: false, skill, onclose: () => {} } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('posts ?/fork with the skill name and a slug derived from the title', () => {
    render(ForkConfirmModal, { props: { open: true, skill, onclose: () => {} } });
    const form = screen.getByRole('form', { name: 'Fork skill' });
    expect(form).toHaveAttribute('action', '?/fork');
    expect((form.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe('contract-review');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('contract-review');
  });

  it('shows a fork error after a failed submit', async () => {
    render(ForkConfirmModal, { props: { open: true, skill, onclose: () => {} } });
    await submitFailure({ error: 'You already have a skill with that id — pick a different slug.' });
    expect(await screen.findByText('You already have a skill with that id — pick a different slug.')).toBeInTheDocument();
  });
});
