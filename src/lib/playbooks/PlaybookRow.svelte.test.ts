/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PlaybookRow from './PlaybookRow.svelte';
import type { Playbook } from './types';

const pb = (over: Partial<Playbook> = {}): Playbook =>
  ({ id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA', description: 'Mutual NDA positions.', version: '1.0.0', created_at: '', updated_at: '', ...over }) as Playbook;

describe('PlaybookRow', () => {
  it('renders the name and description and links to the detail route', () => {
    render(PlaybookRow, { props: { playbook: pb() } });
    const link = screen.getByRole('link', { name: /NDA — Mutual/ });
    expect(link).toHaveAttribute('href', '/playbooks/pb1');
    expect(screen.getByText('Mutual NDA positions.')).toBeInTheDocument();
  });
  it('omits the description line when absent', () => {
    render(PlaybookRow, { props: { playbook: pb({ description: undefined }) } });
    expect(screen.getByRole('link', { name: /NDA — Mutual/ })).toHaveAttribute('href', '/playbooks/pb1');
  });
});
