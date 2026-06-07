import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import MatterPicker from './MatterPicker.svelte';

const matters = [
  { id: 'a', name: 'Acme MSA' },
  { id: 'b', name: 'Beta NDA' }
];

describe('MatterPicker', () => {
  it('opens, lists matters + a "No matter" default, and selecting one updates the trigger', async () => {
    render(MatterPicker, { props: { matters } });
    const trigger = screen.getByRole('button', { name: /choose matter/i });
    expect(trigger).toHaveTextContent('Matter'); // nothing selected
    await fireEvent.click(trigger);
    expect(screen.getByText('No matter (general)')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Acme MSA' }));
    expect(trigger).toHaveTextContent('Acme MSA'); // selection reflected
  });

  it('filters the list by the search query', async () => {
    render(MatterPicker, { props: { matters } });
    await fireEvent.click(screen.getByRole('button', { name: /choose matter/i }));
    await fireEvent.input(screen.getByLabelText(/search matters/i), { target: { value: 'beta' } });
    expect(screen.getByRole('button', { name: 'Beta NDA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acme MSA' })).not.toBeInTheDocument();
  });

  it('choosing "No matter" clears the selection back to the default label', async () => {
    render(MatterPicker, { props: { matters, selectedId: 'a' } });
    const trigger = screen.getByRole('button', { name: 'Matter: Acme MSA' });
    expect(trigger).toHaveTextContent('Acme MSA');
    await fireEvent.click(trigger);
    await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
    expect(trigger).toHaveTextContent('Matter');
  });

  it('trigger aria-label names the selected matter', async () => {
    render(MatterPicker, { props: { matters, selectedId: 'a' } });
    const trigger = screen.getByRole('button', { name: 'Matter: Acme MSA' });
    await fireEvent.click(trigger);
    await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
    expect(screen.getByRole('button', { name: 'Choose matter' })).toBeInTheDocument();
  });
});
