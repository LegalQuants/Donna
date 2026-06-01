/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ pathname: '/settings/account' }));
vi.mock('$app/state', () => ({ page: { get url() { return new URL('http://localhost' + h.pathname); } } }));

import SettingsRail from './SettingsRail.svelte';

describe('SettingsRail', () => {
  it('renders the Account section link', () => {
    h.pathname = '/settings/account';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/settings/account');
  });

  it('marks Account active on /settings/account', () => {
    h.pathname = '/settings/account';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  });
});
