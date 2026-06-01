/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import Page from './+page.svelte';

describe('/settings/data page', () => {
  it('renders the heading, export card, delete button, and cancel link', () => {
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: /data & privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel scheduled deletion/i })).toBeInTheDocument();
  });

  it('opens the delete modal when Delete my account is clicked', async () => {
    const { getByRole } = render(Page);
    await getByRole('button', { name: /delete my account/i }).click();
    expect(screen.getByRole('dialog', { name: /delete your account/i })).toBeInTheDocument();
  });
});
