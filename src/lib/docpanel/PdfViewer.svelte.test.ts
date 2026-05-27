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
});
