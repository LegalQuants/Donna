/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CitationView from './CitationView.svelte';
import { _resetFileCache } from '$lib/citations/files';
import type { Citation } from '$lib/citations/types';

afterEach(() => { _resetFileCache(); vi.unstubAllGlobals(); });

const cites: Citation[] = [
  { id: 'c1', source_file_id: 'f1', source_text: 'thirty days notice', source_page: 1,
    partial: false, verified: true, verification_method: 'exact_match' }
];

describe('CitationView', () => {
  it('renders a colored tab and opens the popover on click; Esc closes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ filename: 'A.pdf' }), { status: 200 })));
    const { container, queryByRole, getByRole } = render(CitationView, {
      props: { content: 'Terminate on "thirty days" (Source: [1]).', citations: cites }
    });
    const tab = container.querySelector('.cite-tab.cite-verified') as HTMLElement;
    expect(tab).not.toBeNull();
    expect(queryByRole('dialog')).toBeNull();
    await fireEvent.click(tab);
    expect(getByRole('dialog')).toBeInTheDocument();
    await fireEvent.keyDown(container, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('closes the popover when Escape is pressed on the focused pill', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ filename: 'A.pdf' }), { status: 200 })));
    const { container, getByRole, queryByRole } = render(CitationView, {
      props: { content: 'Terminate on "thirty days" (Source: [1]).', citations: cites }
    });
    const tab = container.querySelector('.cite-tab.cite-verified') as HTMLElement;
    await fireEvent.click(tab);
    expect(getByRole('dialog')).toBeInTheDocument();
    await fireEvent.keyDown(tab, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('opens an unverified popover for an out-of-range marker', async () => {
    const { container, getByText } = render(CitationView, {
      props: { content: 'Claim "x" (Source: [2]).', citations: cites }
    });
    const tab = container.querySelector('.cite-tab.cite-unverified') as HTMLElement;
    expect(tab).not.toBeNull();
    await fireEvent.click(tab);
    expect(getByText(/could not be matched/i)).toBeInTheDocument();
  });
});
