/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DraftReview from './DraftReview.svelte';
import type { DraftPlaybook } from './types';

const draft: DraftPlaybook = {
  name: 'Generated NDA Playbook',
  contract_type: 'NDA',
  version: '1.0.0',
  description: 'desc',
  positions: [
    { issue: 'Compelled Disclosure', standard_language: 'L1', severity_if_missing: 'high' },
    { issue: 'Term', standard_language: 'L2', severity_if_missing: 'medium' }
  ]
};

describe('DraftReview', () => {
  it('renders the name field and a card per position', () => {
    render(DraftReview, { props: { draft, onchange: vi.fn() } });
    expect((screen.getByLabelText(/playbook name/i) as HTMLInputElement).value).toBe('Generated NDA Playbook');
    expect(screen.getByText('Compelled Disclosure')).toBeInTheDocument();
    expect(screen.getByText('Term')).toBeInTheDocument();
  });
  it('unchecking a position drops it from the emitted PlaybookCreate', async () => {
    const onchange = vi.fn();
    render(DraftReview, { props: { draft, onchange } });
    await fireEvent.click(screen.getByRole('checkbox', { name: /keep Compelled Disclosure/i }));
    const last = onchange.mock.calls.at(-1)![0];
    expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual(['Term']);
  });
  it('editing the name updates the emitted value', async () => {
    const onchange = vi.fn();
    render(DraftReview, { props: { draft, onchange } });
    await fireEvent.input(screen.getByLabelText(/playbook name/i), { target: { value: 'My NDA' } });
    expect(onchange.mock.calls.at(-1)![0].name).toBe('My NDA');
  });
});
