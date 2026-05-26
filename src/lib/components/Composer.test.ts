/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Composer from './Composer.svelte';

describe('Composer', () => {
  it('disables send when empty and enables when typed', async () => {
    const { getByRole } = render(Composer, { props: {} });
    const send = getByRole('button', { name: /send/i });
    expect(send).toBeDisabled();
    await userEvent.type(getByRole('textbox'), 'hello');
    expect(send).not.toBeDisabled();
  });

  it('submits on Enter, newline on Shift+Enter', async () => {
    const onsubmit = vi.fn();
    const { getByRole } = render(Composer, { props: { onsubmit } });
    const ta = getByRole('textbox');
    await userEvent.type(ta, 'first{Shift>}{Enter}{/Shift}second');
    expect(onsubmit).not.toHaveBeenCalled();
    await userEvent.type(ta, '{Enter}');
    expect(onsubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit when only whitespace', async () => {
    const onsubmit = vi.fn();
    const { getByRole } = render(Composer, { props: { onsubmit } });
    await userEvent.type(getByRole('textbox'), '   {Enter}');
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('shows a Stop button while streaming and calls onstop', async () => {
    const onstop = vi.fn();
    const { getByRole } = render(Composer, { props: { streaming: true, onstop } });
    const btn = getByRole('button', { name: /stop/i });
    btn.click();
    expect(onstop).toHaveBeenCalledTimes(1);
  });

  it('renders the model picker and submits the selected model', async () => {
    const onsubmit = vi.fn();
    const { getByRole, getByTestId } = render(Composer, { props: { onsubmit } });
    expect(getByTestId('model-picker')).toBeInTheDocument();
    await userEvent.type(getByRole('textbox'), 'hello');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('hello', expect.any(String), []);
  });

  it('hides skill UI and submits empty skills when no skillAttach is passed (landing)', async () => {
    const onsubmit = vi.fn();
    const { getByRole, queryByTestId } = render(Composer, { props: { onsubmit } });
    expect(queryByTestId('skill-attach')).toBeNull();
    await userEvent.type(getByRole('textbox'), 'hello');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('hello', expect.any(String), []);
  });

  it('renders chips + skill button and submits attached slugs when skillAttach is passed', async () => {
    const onsubmit = vi.fn();
    const skillAttach = {
      attached: [{ slug: 'nda-review', title: 'NDA Review' }],
      results: [],
      loading: false,
      error: false,
      names: ['nda-review'],
      open: vi.fn(),
      search: vi.fn(),
      attach: vi.fn(),
      remove: vi.fn()
    } as unknown as ReturnType<typeof import('$lib/skills/attach.svelte').createSkillAttach>;
    const { getByRole, getByTestId, getByText } = render(Composer, { props: { onsubmit, skillAttach } });
    expect(getByTestId('skill-attach')).toBeInTheDocument();
    expect(getByText('NDA Review')).toBeInTheDocument();
    await userEvent.type(getByRole('textbox'), 'review this');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('review this', expect.any(String), ['nda-review']);
  });

  it('removes a chip via its remove control', async () => {
    const remove = vi.fn();
    const skillAttach = {
      attached: [{ slug: 'nda-review', title: 'NDA Review' }],
      results: [], loading: false, error: false, names: ['nda-review'],
      open: vi.fn(), search: vi.fn(), attach: vi.fn(), remove
    } as unknown as ReturnType<typeof import('$lib/skills/attach.svelte').createSkillAttach>;
    const { getByRole } = render(Composer, { props: { skillAttach } });
    await userEvent.click(getByRole('button', { name: /remove nda review/i }));
    expect(remove).toHaveBeenCalledWith('nda-review');
  });
});
