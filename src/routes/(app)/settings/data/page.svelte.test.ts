/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
import Page from './+page.svelte';

// Only `deletion_scheduled_at` is read by the page; cast to `never` like the Account test.
const props = (deletion_scheduled_at: string | null = null) =>
  ({ data: { user: { deletion_scheduled_at } }, form: null }) as never;

describe('/settings/data page', () => {
  it('not-pending: renders heading, export card, delete button, and no banner or cancel control', () => {
    render(Page, props(null));
    expect(screen.getByRole('heading', { level: 1, name: /data & privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
    expect(screen.queryByText(/pending deletion/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /cancel scheduled deletion/i })).toBeNull();
  });

  it('opens the delete modal when Delete my account is clicked', async () => {
    const { getByRole } = render(Page, props(null));
    await getByRole('button', { name: /delete my account/i }).click();
    expect(screen.getByRole('dialog', { name: /delete your account/i })).toBeInTheDocument();
  });

  it('pending: shows the banner with the scheduled date and a cancel control, and hides delete', () => {
    const iso = '2026-07-01T12:00:00Z';
    // Compute the expected string the same way the component does, so the assertion is timezone-agnostic.
    const expectedDate = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    render(Page, props(iso));
    expect(screen.getByText(/pending deletion/i)).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel scheduled deletion/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete my account/i })).toBeNull();
  });
});
