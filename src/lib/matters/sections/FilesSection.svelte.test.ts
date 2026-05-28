/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FilesSection from './FilesSection.svelte';
import type { components } from '$lib/api/backend';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

type File = components['schemas']['File'];

const file = (over: Partial<File>): File => ({
  id: 'f1', owner_id: 'u', filename: 'msa.pdf', mime_type: 'application/pdf',
  size_bytes: 1024, ingestion_status: 'ready', created_at: '2026-05-28T00:00:00Z',
  ...over
});

describe('FilesSection', () => {
  it('renders the Files heading', () => {
    render(FilesSection, { props: { files: [] } });
    expect(screen.getByRole('heading', { name: /files/i })).toBeInTheDocument();
  });

  it('empty state shows the Dropzone prompt and no rows', () => {
    render(FilesSection, { props: { files: [] } });
    expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
    expect(screen.queryByText(/msa\.pdf/)).not.toBeInTheDocument();
  });

  it('populated state shows one row per file plus an "Add file" button', () => {
    render(FilesSection, { props: { files: [file({ id: 'a', filename: 'a.pdf' }), file({ id: 'b', filename: 'b.pdf' })] } });
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add file/i })).toBeInTheDocument();
  });

  it('"Add file" button opens the hidden file input', async () => {
    render(FilesSection, { props: { files: [file({})] } });
    // The hidden input is the form's; the Dropzone is hidden in populated state.
    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const clickSpy = vi.spyOn(inputs[0] as HTMLInputElement, 'click');
    await userEvent.click(screen.getByRole('button', { name: /add file/i }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('wraps the upload input in a form pointing at ?/uploadFile with multipart enctype', () => {
    render(FilesSection, { props: { files: [] } });
    const form = screen.getByRole('form', { name: /upload files/i });
    expect(form).toHaveAttribute('action', '?/uploadFile');
    expect(form).toHaveAttribute('enctype', 'multipart/form-data');
  });

  it('surfaces a server error message via the error prop', () => {
    render(FilesSection, { props: { files: [], error: 'File "x" is too large — max 100 MB.' } });
    expect(screen.getByText(/file "x" is too large/i)).toBeInTheDocument();
  });
});
