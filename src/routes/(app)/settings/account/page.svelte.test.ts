/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'ada@firm.com', display_name: 'Ada Counsel', is_admin: true, role: 'admin',
  mfa_enabled: false, must_change_password: false, reasoning_visibility: 'disclosure',
  featured_tools: 'prominent', workspace_layout: 'three_pane', trust_pills: 'labels',
  provenance_pills: 'always', created_at: '2026-01-05T00:00:00Z', last_login_at: '2026-05-30T00:00:00Z', ...over
});
const props = (over: Record<string, unknown> = {}) => ({ data: { user: user(over) }, form: null }) as never;

describe('/settings/account', () => {
  it('renders read-only profile fields + the not-editable note', () => {
    render(Page, props());
    expect(screen.getByText('ada@firm.com')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText(/email isn't editable/i)).toBeInTheDocument();
  });

  it('links Change password to /change-password', () => {
    render(Page, props());
    expect(screen.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/change-password');
  });

  it('shows Off and no Disable button when MFA is disabled', () => {
    render(Page, props({ mfa_enabled: false }));
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it('shows a Disable button when MFA is enabled, and clicking it opens the modal', async () => {
    render(Page, props({ mfa_enabled: true }));
    const btn = screen.getByRole('button', { name: 'Disable' });
    expect(btn).toBeInTheDocument();
    await fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: /disable two-factor/i })).toBeInTheDocument();
  });
});
