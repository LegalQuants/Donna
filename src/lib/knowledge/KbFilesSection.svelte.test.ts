/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import KbFilesSection from './KbFilesSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('KbFilesSection', () => {
  it('renders the Dropzone when there are zero attached files and zero pending uploads', () => {
    render(KbFilesSection, { props: { files: [] } });
    expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
  });

  it('renders the upload form with multipart enctype + name="file" hidden input', () => {
    const { container } = render(KbFilesSection, { props: { files: [] } });
    const form = container.querySelector('form[action="?/uploadFile"]') as HTMLFormElement;
    expect(form.getAttribute('enctype')).toBe('multipart/form-data');
    const input = form.querySelector('input[type="file"][name="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.multiple).toBe(true);
  });

  it('regression: the nested Dropzone <input> has NO name attribute (P4-3a bug-fix invariant)', () => {
    const { container } = render(KbFilesSection, { props: { files: [] } });
    const dz = container.querySelector('[data-testid="dropzone-input"]') as HTMLInputElement;
    expect(dz).not.toBeNull();
    expect(dz.hasAttribute('name')).toBe(false);
  });

  it('renders attached file rows and an "Add file" button when files are present', () => {
    render(KbFilesSection, {
      props: {
        files: [
          {
            id: 'f1',
            owner_id: 'u',
            filename: 'msa.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
            hash_sha256: 'h',
            ingestion_status: 'ready' as const,
            created_at: '',
            attached_at: ''
          }
        ]
      }
    });
    expect(screen.getByText('msa.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add file/i })).toBeInTheDocument();
  });

  it('renders an inline error when the error prop is set', () => {
    render(KbFilesSection, { props: { files: [], error: 'Too large' } });
    expect(screen.getByText('Too large')).toBeInTheDocument();
  });

  it('renders pending upload rows from the `pendingUploads` prop alongside attached rows', () => {
    render(KbFilesSection, {
      props: {
        files: [
          {
            id: 'f1',
            owner_id: 'u',
            filename: 'msa.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
            hash_sha256: 'h',
            ingestion_status: 'ready' as const,
            created_at: '',
            attached_at: ''
          }
        ],
        pendingUploads: [{ file_id: 'p1', filename: 'pending.pdf', size_bytes: 2048, status: 'pending' as const }]
      }
    });
    expect(screen.getByText('msa.pdf')).toBeInTheDocument();
    expect(screen.getByText('pending.pdf')).toBeInTheDocument();
  });
});
