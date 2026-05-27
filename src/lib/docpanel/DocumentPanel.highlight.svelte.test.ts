import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import DocumentPanel from './DocumentPanel.svelte';
import type { DocPanel } from './docPanel.svelte';
import type { DocTab } from './types';

// Mock the highlight module so we can observe clearHighlight without a real
// CSS Custom Highlight API (absent in jsdom). highlightQuote is mocked because
// PdfViewer imports it; scrollCitedIntoView because the cite bar imports it.
vi.mock('./pdfHighlight', () => ({
  clearHighlight: vi.fn(),
  scrollCitedIntoView: vi.fn(),
  highlightQuote: vi.fn(() => 'miss')
}));
import { clearHighlight } from './pdfHighlight';

const CITE = { id: 'c1', source_file_id: 'f1', source_page: 1, source_text: 'x', verified: true, partial: false };
const tab = (over: Partial<DocTab>): DocTab => ({ fileId: 'f1', filename: 'a.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: CITE, highlightStatus: 'pending', ...over });
function stub(active: DocTab): DocPanel {
  return { open_: true, tabs: [active], activeId: active.fileId, activeTab: active, width: 480, open: vi.fn(), setActive: vi.fn(), close: vi.fn(), closePanel: vi.fn(), setWidth: vi.fn(), setHighlightStatus: vi.fn() } as unknown as DocPanel;
}

beforeEach(() => vi.mocked(clearHighlight).mockClear());

describe('DocumentPanel highlight cleanup', () => {
  it('clears the cite highlight when the active tab is a non-PDF', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ mime: 'text/plain' })) } });
    expect(clearHighlight).toHaveBeenCalled();
  });

  it('clears the cite highlight when the active tab errored', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ status: 'error' })) } });
    expect(clearHighlight).toHaveBeenCalled();
  });

  it('does NOT clear for a ready PDF active tab (PdfViewer owns the highlight)', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ mime: 'application/pdf', status: 'ready' })) } });
    expect(clearHighlight).not.toHaveBeenCalled();
  });
});
