/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CreateKbForm from './CreateKbForm.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('CreateKbForm', () => {
  it('renders a form posting to ?/createKb with a required name field', () => {
    render(CreateKbForm, { props: { onsubmit: () => {} } });
    const form = screen.getByRole('form', { name: 'Create knowledge base' });
    expect(form).toHaveAttribute('action', '?/createKb');
    const name = form.querySelector('input[name="name"]') as HTMLInputElement;
    expect(name.required).toBe(true);
  });

  it('disables the Create button when the name is empty / whitespace', async () => {
    render(CreateKbForm, { props: { onsubmit: () => {} } });
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    await fireEvent.input(name, { target: { value: '   ' } });
    expect(create).toBeDisabled();
    await fireEvent.input(name, { target: { value: 'Acme' } });
    expect(create).not.toBeDisabled();
  });

  it('calls onsubmit when the form is submitted', async () => {
    const onsubmit = vi.fn();
    const { container } = render(CreateKbForm, { props: { onsubmit } });
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    await fireEvent.input(name, { target: { value: 'Acme' } });
    const form = container.querySelector('form') as HTMLFormElement;
    form.addEventListener('submit', (e) => e.preventDefault(), true);
    await fireEvent.submit(form);
    expect(onsubmit).toHaveBeenCalled();
  });
});
