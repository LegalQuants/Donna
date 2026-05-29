/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Sidebar from './Sidebar.svelte';

beforeEach(() => localStorage.clear());

describe('Sidebar', () => {
  it('includes a Skills nav link pointing at /skills', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
  });

  it('keeps the existing Projects link', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/matters');
  });
});
