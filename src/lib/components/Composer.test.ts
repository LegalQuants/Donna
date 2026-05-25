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
});
