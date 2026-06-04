/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/automations index', () => {
  it('renders Workflows nav with Automations active and the empty state', () => {
    render(Page, { props: { data: { sessions: [], unread: 0 } } as never });
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Automations' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/no automations yet/i)).toBeInTheDocument();
  });
});
