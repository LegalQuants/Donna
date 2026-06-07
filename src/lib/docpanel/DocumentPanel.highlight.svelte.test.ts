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
import { clearHighlight, scrollCitedIntoView } from './pdfHighlight';

const CITE = {
	id: 'c1',
	source_file_id: 'f1',
	source_page: 1,
	source_text: 'x',
	verified: true,
	partial: false
};
const tab = (over: Partial<DocTab>): DocTab => ({
	fileId: 'f1',
	filename: 'a.pdf',
	mime: 'application/pdf',
	status: 'ready',
	page: 1,
	quote: 'x',
	cite: CITE,
	highlightStatus: 'pending',
	...over
});
function stub(active: DocTab): DocPanel {
	return {
		open_: true,
		tabs: [active],
		activeId: active.fileId,
		activeTab: active,
		width: 480,
		open: vi.fn(),
		setActive: vi.fn(),
		close: vi.fn(),
		closePanel: vi.fn(),
		setWidth: vi.fn(),
		setHighlightStatus: vi.fn()
	} as unknown as DocPanel;
}

// Drive both nested requestAnimationFrame callbacks synchronously so the auto-
// scroll effect's scheduled scrollCitedIntoView() is observable in the same tick.
function flushRaf() {
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
		cb(0);
		return 0 as unknown as number;
	});
}

beforeEach(() => {
	vi.mocked(clearHighlight).mockClear();
	vi.mocked(scrollCitedIntoView).mockClear();
	vi.restoreAllMocks();
});

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
		render(DocumentPanel, {
			props: { docPanel: stub(tab({ mime: 'application/pdf', status: 'ready' })) }
		});
		expect(clearHighlight).not.toHaveBeenCalled();
	});

	it('does NOT clear while a PDF is still loading', () => {
		render(DocumentPanel, {
			props: { docPanel: stub(tab({ mime: 'application/pdf', status: 'loading' })) }
		});
		expect(clearHighlight).not.toHaveBeenCalled();
	});
});

describe('DocumentPanel auto-scroll on highlight found', () => {
	it('auto-scrolls the cited passage into view after the highlight lands', () => {
		flushRaf();
		render(DocumentPanel, { props: { docPanel: stub(tab({ highlightStatus: 'found' })) } });
		expect(scrollCitedIntoView).toHaveBeenCalledTimes(1);
	});

	it('does NOT auto-scroll while the highlight is still pending', () => {
		flushRaf();
		render(DocumentPanel, { props: { docPanel: stub(tab({ highlightStatus: 'pending' })) } });
		expect(scrollCitedIntoView).not.toHaveBeenCalled();
	});

	it('does NOT auto-scroll on a miss (nothing to jump to)', () => {
		flushRaf();
		render(DocumentPanel, { props: { docPanel: stub(tab({ highlightStatus: 'miss' })) } });
		expect(scrollCitedIntoView).not.toHaveBeenCalled();
	});
});
