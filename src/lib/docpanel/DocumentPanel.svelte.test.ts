import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DocumentPanel from './DocumentPanel.svelte';
import type { DocPanel } from './docPanel.svelte';
import type { DocTab } from './types';

const STUB_CITE = { id: 'c1', source_file_id: 'f1', source_page: 1, source_text: 'x', verified: true, partial: false };

// A hand-rolled stub controller (plain object) matching the DocPanel surface the panel uses.
function stub(over: Partial<DocPanel> = {}): DocPanel {
  return {
    open_: true,
    tabs: [{ fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' }],
    activeId: 'f1',
    activeTab: { fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' },
    width: 480,
    open: vi.fn(),
    setActive: vi.fn(),
    close: vi.fn(),
    closePanel: vi.fn(),
    setWidth: vi.fn(),
    setHighlightStatus: vi.fn(),
    ...over
  } as unknown as DocPanel;
}

describe('DocumentPanel', () => {
  it('renders the active tab filename', () => {
    render(DocumentPanel, { props: { docPanel: stub() } });
    expect(screen.getByText('spike.pdf')).toBeInTheDocument();
  });

  it('calls closePanel when the close button is clicked', async () => {
    const dp = stub();
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: /close document panel/i }));
    expect(dp.closePanel).toHaveBeenCalledOnce();
  });

  it('renders the error message when the active tab failed to load', () => {
    render(DocumentPanel, {
      props: { docPanel: stub({ activeTab: { fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'error', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' } }) }
    });
    expect(screen.getByText(/could not load this document/i)).toBeInTheDocument();
  });

  it('renders the fallback card with a download link for a ready non-PDF file', () => {
    render(DocumentPanel, {
      props: { docPanel: stub({ activeTab: { fileId: 'f2', filename: 'memo.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'ready', page: null, quote: '', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' } }) }
    });
    expect(screen.getByText('memo.docx')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', '/files/f2/content');
  });

  it('shows the cited quote and a verified chip in the found state', () => {
    const foundTab: DocTab = { fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'found' };
    render(DocumentPanel, { props: { docPanel: stub({ tabs: [foundTab], activeTab: foundTab }) } });
    // The stub's activeTab is highlightStatus 'found' with a verified citation.
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Jump to ¶/i)).toBeInTheDocument();
  });

  it('shows the amber miss callout with the full quote when highlight missed', () => {
    const missTab: DocTab = { fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'miss' };
    render(DocumentPanel, { props: { docPanel: stub({ tabs: [missTab], activeTab: missTab }) } });
    expect(screen.getByText(/couldn't pinpoint|cited passage on this page/i)).toBeInTheDocument();
  });

  it('renders a tab button per open document, marking the active one', () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    render(DocumentPanel, { props: { docPanel: stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 }) } });
    expect(screen.getByRole('button', { name: 'msa.pdf' })).toBeInTheDocument();
    const active = screen.getByRole('button', { name: 'nda.pdf' });
    expect(active).toHaveAttribute('aria-current', 'true');
  });

  it('clicking an inactive tab calls setActive with its fileId', async () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    const dp = stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 });
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: 'msa.pdf' }));
    expect(dp.setActive).toHaveBeenCalledWith('f1');
  });

  it('clicking a tab close button calls close (not setActive)', async () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    const dp = stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 });
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: 'Close msa.pdf' }));
    expect(dp.close).toHaveBeenCalledWith('f1');
    expect(dp.setActive).not.toHaveBeenCalled();
  });

  it('shows the active page number in the cited-passage bar', () => {
    render(DocumentPanel, { props: { docPanel: stub() } }); // default activeTab: spike.pdf, page 1, pdf, ready
    expect(screen.getByText('p.1')).toBeInTheDocument();
  });
});
