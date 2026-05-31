/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

describe('/playbooks index', () => {
  it('opening the New playbook menu reveals both create paths', async () => {
    render(Page, { props: { data: { playbooks: [] } } as never });
    await fireEvent.click(screen.getByRole('button', { name: /new playbook/i }));
    expect(screen.getByRole('link', { name: /generate from documents/i })).toHaveAttribute('href', '/playbooks/new');
    expect(screen.getByRole('link', { name: /start from scratch/i })).toHaveAttribute('href', '/playbooks/new/manual');
  });
});
