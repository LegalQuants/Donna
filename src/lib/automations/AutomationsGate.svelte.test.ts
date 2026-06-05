// src/lib/automations/AutomationsGate.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import AutomationsGate from './AutomationsGate.svelte';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
afterEach(() => vi.restoreAllMocks());

describe('AutomationsGate', () => {
  it('shows the opt-in copy and an enable button', () => {
    render(AutomationsGate);
    expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable automations/i })).toBeInTheDocument();
  });
  it('PATCHes the preference on enable', async () => {
    render(AutomationsGate);
    await fireEvent.click(screen.getByRole('button', { name: /enable automations/i }));
    const [url, init] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(url).toBe('/settings/preferences');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ autonomous_enabled: true });
  });
});
