import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDocPanel } from './docPanel.svelte';
import type { Citation } from '$lib/citations/types';

vi.mock('./pdfHighlight', () => ({ clearHighlight: vi.fn() }));
import { clearHighlight } from './pdfHighlight';

const cite = (over: Partial<Citation> = {}): Citation => ({
  id: 'c1', source_file_id: 'f1', source_page: 1,
  source_text: 'hello', verified: true, partial: false, ...over
});

const meta = (over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf', ...over }), { status: 200 });

beforeEach(() => localStorage.clear());
beforeEach(() => vi.mocked(clearHighlight).mockClear());

describe('createDocPanel', () => {
  it('opens a tab from a citation, sets it active, and records the pending highlight', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1', source_page: 3, source_text: 'clause text' }), fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/files/f1');
    expect(dp.open_).toBe(true);
    expect(dp.tabs).toHaveLength(1);
    expect(dp.activeId).toBe('f1');
    expect(dp.activeTab).toMatchObject({ fileId: 'f1', filename: 'a.pdf', mime: 'application/pdf', status: 'ready', page: 3, quote: 'clause text' });
  });

  it('dedupes by source_file_id and just refocuses the existing tab', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    await dp.open(cite({ source_file_id: 'f1', source_page: 9, source_text: 'other' }), fetchFn);
    expect(dp.tabs).toHaveLength(1);
    expect(dp.activeTab).toMatchObject({ fileId: 'f1', page: 9, quote: 'other' });
  });

  it('marks the tab status error when metadata fetch fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
    const dp = createDocPanel();
    await dp.open(cite(), fetchFn);
    expect(dp.activeTab?.status).toBe('error');
  });

  it('closes a tab; closing the last tab closes the panel', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    dp.close('f1');
    expect(dp.tabs).toHaveLength(0);
    expect(dp.open_).toBe(false);
  });

  it('persists width to localStorage and restores it on a fresh controller', () => {
    const dp = createDocPanel();
    dp.setWidth(620);
    expect(localStorage.getItem('donna.docpanel.width')).toBe('620');
    expect(createDocPanel().width).toBe(620);
  });

  it('stores the citation and starts highlight status pending', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    const c = cite({ source_file_id: 'f1', source_text: 'clause text' });
    await dp.open(c, fetchFn);
    expect(dp.activeTab?.cite).toEqual(c);
    expect(dp.activeTab?.highlightStatus).toBe('pending');
  });

  it('setHighlightStatus updates the tab; re-opening (dedupe) resets it to pending', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    dp.setHighlightStatus('f1', 'found');
    expect(dp.activeTab?.highlightStatus).toBe('found');
    await dp.open(cite({ source_file_id: 'f1', source_page: 5, source_text: 'other' }), fetchFn);
    expect(dp.activeTab?.highlightStatus).toBe('pending');
  });

  it('clears the cite highlight when closing the last tab empties the panel', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    expect(clearHighlight).not.toHaveBeenCalled();
    dp.close('f1');
    expect(dp.open_).toBe(false);
    expect(clearHighlight).toHaveBeenCalledTimes(1);
  });

  it('closing a non-last tab does not clear the highlight', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    await dp.open(cite({ source_file_id: 'f2' }), fetchFn);
    dp.close('f1');
    expect(dp.tabs).toHaveLength(1);
    expect(clearHighlight).not.toHaveBeenCalled();
  });
});
