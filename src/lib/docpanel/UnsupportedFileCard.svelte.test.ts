import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import UnsupportedFileCard from './UnsupportedFileCard.svelte';

describe('UnsupportedFileCard', () => {
  it('renders the filename and a download link to the content route', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'terms.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } });
    expect(screen.getByText('terms.docx')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', '/files/f9/content');
    expect(link).toHaveAttribute('download', 'terms.docx');
  });

  it('shows the exact mime type for transparency', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'terms.docx', mime: 'application/vnd.ms-excel' } });
    expect(screen.getByText(/application\/vnd\.ms-excel/)).toBeInTheDocument();
  });

  it('derives the extension badge from the filename', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'report.final.csv', mime: 'text/csv' } });
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('falls back gracefully when filename is empty', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: '', mime: 'application/octet-stream' } });
    expect(screen.getByText('Document')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).not.toHaveAttribute('download'); // no name to suggest
  });
});
