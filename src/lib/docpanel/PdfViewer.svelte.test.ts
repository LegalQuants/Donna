import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PdfViewer from './PdfViewer.svelte';

describe('PdfViewer', () => {
  it('fetches the file content and hands the bytes to renderPdf', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } }));
    const renderPdf = vi.fn().mockResolvedValue({ numPages: 2 });

    render(PdfViewer, { props: { fileId: 'f1', fetchFn, renderPdf } });
    // allow the onMount async chain to settle
    await vi.waitFor(() => expect(renderPdf).toHaveBeenCalledTimes(1));

    expect(fetchFn).toHaveBeenCalledWith('/files/f1/content');
    const passedBytes = new Uint8Array(renderPdf.mock.calls[0][1]);
    expect(passedBytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    await vi.waitFor(() => expect(screen.queryByTestId('pdf-loading')).not.toBeInTheDocument());
  });

  it('shows an error state when the content fetch fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
    const renderPdf = vi.fn();
    render(PdfViewer, { props: { fileId: 'f1', fetchFn, renderPdf } });
    await vi.waitFor(() => expect(screen.getByTestId('pdf-error')).toBeInTheDocument());
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it('shows an error state when renderPdf rejects', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } }));
    const renderPdf = vi.fn().mockRejectedValue(new Error('invalid PDF structure'));
    render(PdfViewer, { props: { fileId: 'f1', fetchFn, renderPdf } });
    await vi.waitFor(() => expect(screen.getByTestId('pdf-error')).toBeInTheDocument());
  });

  it('highlights the cited span after render and reports the result', async () => {
    const bytes = new Uint8Array([0x25]).buffer;
    const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    // fake renderPdf populates the container with a page + text layer
    const renderPdf = vi.fn().mockImplementation(async (container: HTMLElement) => {
      const pg = document.createElement('div');
      pg.className = 'pdf-page';
      pg.dataset.pageNumber = '2';
      const tl = document.createElement('div');
      tl.className = 'textLayer';
      pg.appendChild(tl);
      container.appendChild(pg);
      return { numPages: 3 };
    });
    const highlightQuote = vi.fn().mockReturnValue('found');
    const onhighlight = vi.fn();

    render(PdfViewer, { props: { fileId: 'f1', page: 2, quote: 'hello clause', fetchFn, renderPdf, highlightQuote, onhighlight } });

    await vi.waitFor(() => expect(highlightQuote).toHaveBeenCalled());
    const [pageElArg, quoteArg] = highlightQuote.mock.calls[0];
    expect((pageElArg as HTMLElement).dataset.pageNumber).toBe('2');
    expect(quoteArg).toBe('hello clause');
    await vi.waitFor(() => expect(onhighlight).toHaveBeenCalledWith('found'));
  });

  it('reports "miss" when the cited page is not present', async () => {
    const bytes = new Uint8Array([0x25]).buffer;
    const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    const renderPdf = vi.fn().mockResolvedValue({ numPages: 1 }); // renders nothing
    const highlightQuote = vi.fn();
    const onhighlight = vi.fn();
    render(PdfViewer, { props: { fileId: 'f1', page: 9, quote: 'x', fetchFn, renderPdf, highlightQuote, onhighlight } });
    await vi.waitFor(() => expect(onhighlight).toHaveBeenCalledWith('miss'));
    expect(highlightQuote).not.toHaveBeenCalled(); // no page element → miss before calling
  });

  it('reports "miss" when the page is present but the quote is not located', async () => {
    const bytes = new Uint8Array([0x25]).buffer;
    const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    const renderPdf = vi.fn().mockImplementation(async (container: HTMLElement) => {
      const pg = document.createElement('div');
      pg.className = 'pdf-page';
      pg.dataset.pageNumber = '1';
      const tl = document.createElement('div');
      tl.className = 'textLayer';
      pg.appendChild(tl);
      container.appendChild(pg);
      return { numPages: 1 };
    });
    const highlightQuote = vi.fn().mockReturnValue('miss');
    const onhighlight = vi.fn();
    render(PdfViewer, { props: { fileId: 'f1', page: 1, quote: 'absent text', fetchFn, renderPdf, highlightQuote, onhighlight } });
    await vi.waitFor(() => expect(highlightQuote).toHaveBeenCalled());
    await vi.waitFor(() => expect(onhighlight).toHaveBeenCalledWith('miss'));
  });
});
