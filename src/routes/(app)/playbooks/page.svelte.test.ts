/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/playbooks index', () => {
  it('has a New playbook link to the wizard', () => {
    render(Page, { props: { data: { playbooks: [] } } as never });
    const link = screen.getByRole('link', { name: /new playbook/i });
    expect(link).toHaveAttribute('href', '/playbooks/new');
  });
});
