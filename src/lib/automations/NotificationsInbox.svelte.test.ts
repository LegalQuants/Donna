/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NotificationsInbox from './NotificationsInbox.svelte';
import type { NotificationItem } from './types';

const n: NotificationItem = {
  id: 'n1', session_id: 's1', channel: 'in_app', title: 'Review ready',
  body: 'Your NDA review finished', read_at: null, created_at: '2026-06-04T09:04:00Z'
};

describe('NotificationsInbox', () => {
  it('renders an unread row linking to its session receipt with a mark-read control', () => {
    render(NotificationsInbox, { props: { notifications: [n], unreadOnly: false } });
    expect(screen.getByRole('link', { name: 'Review ready' })).toHaveAttribute('href', '/automations/s1');
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
  });
  it('shows the empty state', () => {
    render(NotificationsInbox, { props: { notifications: [], unreadOnly: true } });
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
  });
});
