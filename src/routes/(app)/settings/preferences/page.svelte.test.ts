/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

const invalidateAll = vi.fn();
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll() }));
import Page from './+page.svelte';

beforeEach(() => { invalidateAll.mockReset(); });
afterEach(() => vi.restoreAllMocks());

const data = { user: null, provenancePills: 'always' as const, trustPills: 'labels' as const, autonomousEnabled: false };
const props = () => ({ data }) as never;

describe('/settings/preferences page', () => {
  it('renders both segmented controls seeded from data', () => {
    render(Page, props());
    expect(screen.getByRole('radiogroup', { name: /trust indicator/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /message details/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Labels' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Always shown' })).toHaveAttribute('aria-checked', 'true');
  });

  it('optimistically switches and PATCHes the proxy on change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ trust_pills: 'dots' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(Page, props());
    await fireEvent.click(screen.getByRole('radio', { name: 'Dots' }));
    expect(screen.getByRole('radio', { name: 'Dots' })).toHaveAttribute('aria-checked', 'true');
    expect(fetchMock).toHaveBeenCalledWith('/settings/preferences', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ trust_pills: 'dots' });
  });

  it('reverts and shows an error when the PATCH fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    render(Page, props());
    await fireEvent.click(screen.getByRole('radio', { name: 'Collapsed' }));
    expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Always shown' })).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the Automations opt-in switch reflecting the loaded value', () => {
    render(Page, { props: { data: { trustPills: 'labels', provenancePills: 'always', autonomousEnabled: true } } as never });
    const sw = screen.getByRole('switch', { name: /enable automations/i });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});
