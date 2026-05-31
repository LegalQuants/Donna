/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const playbook = { id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', positions: [{ id: 'p1', issue: 'Confidentiality', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }] };

describe('/playbooks/[id] detail', () => {
  it('always shows a Duplicate link to the prefilled create route', () => {
    render(Page, { props: { data: { playbook, isAdmin: false, isOwner: false } } as never });
    expect(screen.getByRole('link', { name: /duplicate/i })).toHaveAttribute('href', '/playbooks/new/manual?from=pb1');
  });
  it('shows Edit + Delete only for the owner', () => {
    const { unmount } = render(Page, { props: { data: { playbook, isAdmin: false, isOwner: true } } as never });
    expect(screen.getByRole('link', { name: /^edit/i })).toHaveAttribute('href', '/playbooks/pb1/edit');
    expect(screen.getByRole('button', { name: /^delete/i })).toBeInTheDocument();
    unmount();
    render(Page, { props: { data: { playbook, isAdmin: false, isOwner: false } } as never });
    expect(screen.queryByRole('link', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });
});
