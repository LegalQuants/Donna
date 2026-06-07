/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// Mutable pathname so we can test active-state across routes in one file.
const h = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('$app/state', () => ({
  page: {
    get url() {
      return new URL('http://localhost' + h.pathname);
    }
  }
}));

import Sidebar from './Sidebar.svelte';

beforeEach(() => {
  localStorage.clear();
  h.pathname = '/';
});

describe('Sidebar', () => {
  it('has a single Workflows entry pointing at /workflows', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute('href', '/workflows');
  });

  it('keeps the existing Projects link', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/matters');
  });

  it('no longer has standalone Skills, Playbooks, or Prompts sidebar entries', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.queryByRole('link', { name: 'Skills' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Playbooks' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Prompts' })).toBeNull();
  });

  it('marks Workflows active on the hub and on each child route', () => {
    for (const path of ['/workflows', '/skills', '/playbooks', '/prompts', '/automations']) {
      h.pathname = path;
      const { unmount } = render(Sidebar, { props: { displayName: 'Admin' } });
      expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('does not mark Workflows active on unrelated routes', () => {
    h.pathname = '/matters';
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Workflows' })).not.toHaveAttribute('aria-current');
  });

  it('marks Assistant active only on exactly /', () => {
    h.pathname = '/';
    const { unmount } = render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Assistant' })).toHaveAttribute('aria-current', 'page');
    unmount();
    h.pathname = '/matters';
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Assistant' })).not.toHaveAttribute('aria-current');
  });

  it('has a Settings entry pointing at /settings, active on /settings/*', () => {
    h.pathname = '/settings/account';
    render(Sidebar, { props: { displayName: 'Admin' } });
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
