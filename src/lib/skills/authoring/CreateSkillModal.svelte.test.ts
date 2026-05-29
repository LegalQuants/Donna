/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CreateSkillModal from './CreateSkillModal.svelte';

type FailData = { field?: string; error?: string };
type PostCb = (args: { result: { type: string; data?: FailData }; update: () => Promise<void> }) => Promise<void>;
type SubmitFn = () => PostCb;

// Capture the use:enhance submit function so a test can drive a failure result
// through the component's real failure-handling code path.
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

describe('CreateSkillModal', () => {
  it('posts to ?/create and derives the slug from the display name', async () => {
    render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
    const form = screen.getByRole('form', { name: 'Create skill' });
    expect(form).toHaveAttribute('action', '?/create');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Contract Review' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('contract-review');
  });

  it('lets the user override the slug, which then stops auto-deriving', async () => {
    render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
    const slug = screen.getByLabelText('Slug') as HTMLInputElement;
    await fireEvent.input(slug, { target: { value: 'my-custom' } });
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Something Else' } });
    expect(slug.value).toBe('my-custom');
  });

  it('seeds a non-empty body and disables Create until name + body present', async () => {
    render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
    const create = screen.getByRole('button', { name: 'Create' });
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    expect(body.value.length).toBeGreaterThan(0);
    expect(create).toBeDisabled();
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'NDA' } });
    expect(create).not.toBeDisabled();
  });

  it('does not render when open is false', () => {
    render(CreateSkillModal, { props: { open: false, onclose: () => {} } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onclose on backdrop click', async () => {
    const onclose = vi.fn();
    const { container } = render(CreateSkillModal, { props: { open: true, onclose } });
    const backdrop = container.querySelector('[role="presentation"]') as HTMLElement;
    await fireEvent.click(backdrop);
    expect(onclose).toHaveBeenCalled();
  });

  it('calls onclose on Escape', async () => {
    const onclose = vi.fn();
    render(CreateSkillModal, { props: { open: true, onclose } });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onclose).toHaveBeenCalled();
  });

  it('shows an inline slug error after a failed submit', async () => {
    render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
    await submitFailure({ field: 'slug', error: 'A skill with that name already exists.' });
    expect(await screen.findByText('A skill with that name already exists.')).toBeInTheDocument();
  });

  it('shows a general error after a failed submit without a field', async () => {
    render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
    await submitFailure({ error: 'Could not create the skill.' });
    expect(await screen.findByText('Could not create the skill.')).toBeInTheDocument();
  });
});
