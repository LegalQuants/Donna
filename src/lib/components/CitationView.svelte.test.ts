import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CitationView from './CitationView.svelte';
import type { Citation } from '$lib/citations/types';

const citations: Citation[] = [
  { id: 'c1', source_file_id: 'f1', source_page: 1, source_text: 'cited clause', verified: true, partial: false }
];

describe('CitationView pill interaction', () => {
  it('opens the metadata popover on focus and not on click', async () => {
    const onactivate = vi.fn();
    const { container } = render(CitationView, { props: { content: 'See the clause (Source: [1]).', citations, onactivate } });
    const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
    expect(pill).toBeTruthy();
    await fireEvent.focusIn(pill);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('calls onactivate on click and does NOT open the popover', async () => {
    const onactivate = vi.fn();
    const { container } = render(CitationView, { props: { content: 'See the clause (Source: [1]).', citations, onactivate } });
    const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
    await userEvent.click(pill);
    expect(onactivate).toHaveBeenCalledWith(citations[0]);
    expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  });

  it('hides the popover on focusout', async () => {
    const onactivate = vi.fn();
    const { container } = render(CitationView, { props: { content: 'See the clause (Source: [1]).', citations, onactivate } });
    const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
    await fireEvent.focusIn(pill);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    await fireEvent.focusOut(pill);
    expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  });

  it('activates on Enter without opening the popover', async () => {
    const onactivate = vi.fn();
    const { container } = render(CitationView, { props: { content: 'See the clause (Source: [1]).', citations, onactivate } });
    const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
    await fireEvent.keyDown(pill, { key: 'Enter' });
    expect(onactivate).toHaveBeenCalledWith(citations[0]);
    expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  });
});
