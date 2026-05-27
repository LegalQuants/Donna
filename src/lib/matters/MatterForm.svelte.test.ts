import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import MatterForm from './MatterForm.svelte';

// use:enhance needs the SvelteKit runtime; stub it to a no-op action in jsdom.
vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('MatterForm', () => {
  it('posts to the given action and disables submit until a name is typed', async () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
    const form = screen.getByRole('form', { name: /matter/i });
    expect(form).toHaveAttribute('action', '?/create');
    const submit = screen.getByRole('button', { name: 'Create matter' });
    expect(submit).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
    expect(submit).toBeEnabled();
  });

  it('seeds name and description in edit mode', () => {
    render(MatterForm, { props: { action: '?/rename', submitLabel: 'Save', name: 'Beta', description: 'Beta engagement' } });
    expect((screen.getByLabelText(/matter name/i) as HTMLInputElement).value).toBe('Beta');
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe('Beta engagement');
  });

  it('surfaces a server error message', () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter', error: 'Could not create the matter.' } });
    expect(screen.getByText('Could not create the matter.')).toBeInTheDocument();
  });
});
