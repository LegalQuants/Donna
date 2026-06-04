// src/lib/automations/AutomationsNav.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import AutomationsNav from './AutomationsNav.svelte';

describe('AutomationsNav', () => {
  it('marks the active tab and links to both views', () => {
    render(AutomationsNav, { props: { active: 'sessions', unread: 0 } });
    const nav = screen.getByRole('navigation', { name: 'Automations views' });
    expect(within(nav).getByRole('link', { name: /sessions/i })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /notifications/i })).toHaveAttribute('href', '/automations/notifications');
  });
  it('shows an unread count when > 0', () => {
    render(AutomationsNav, { props: { active: 'notifications', unread: 3 } });
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
