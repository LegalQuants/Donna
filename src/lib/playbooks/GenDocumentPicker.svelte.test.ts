/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://x/playbooks/new') } }));

import GenDocumentPicker, { type Selected } from './GenDocumentPicker.svelte';

function setup() {
  const selected: Selected[] = [];
  const props = {
    matters: [{ id: 'm1', name: 'Acme' }],
    matterFiles: [{ id: 'f1', filename: 'nda.pdf', document_id: 'd1' }],
    selected,
    onchange: vi.fn((s: Selected[]) => { selected.length = 0; selected.push(...s); })
  };
  return props;
}

describe('GenDocumentPicker', () => {
  it('checking a matter file adds it to the selection', async () => {
    const p = setup();
    render(GenDocumentPicker, { props: p });
    await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /nda\.pdf/i }));
    const last = p.onchange.mock.calls.at(-1)![0];
    expect(last).toEqual([{ kind: 'matter', documentId: 'd1', filename: 'nda.pdf' }]);
  });
  it('shows the selected count', async () => {
    const p = setup();
    render(GenDocumentPicker, { props: p });
    await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /nda\.pdf/i }));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });
});
