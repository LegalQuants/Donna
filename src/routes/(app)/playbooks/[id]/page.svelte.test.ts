/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const data = (isAdmin: boolean) => ({
  data: { playbook: { id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA', version: '1.0.0', positions: [] }, isAdmin }
});

describe('/playbooks/[id] Apply affordance', () => {
  it('shows the Apply link for admins', () => {
    render(Page, { props: data(true) as never });
    const link = screen.getByRole('link', { name: /apply to a document/i });
    expect(link).toHaveAttribute('href', '/playbooks/pb1/run');
  });
  it('shows a note instead for non-admins', () => {
    render(Page, { props: data(false) as never });
    expect(screen.queryByRole('link', { name: /apply to a document/i })).toBeNull();
    expect(screen.getByText(/requires an admin account/i)).toBeInTheDocument();
  });
});
