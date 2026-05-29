/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import KbFileRow from './KbFileRow.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const attached = (over = {}) => ({
  id: 'f1',
  owner_id: 'u',
  filename: 'msa.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1536,
  hash_sha256: 'h',
  ingestion_status: 'ready' as const,
  created_at: '2026-05-28T00:00:00Z',
  attached_at: '2026-05-28T00:00:00Z',
  ...over
});

const pending = (over = {}) => ({
  file_id: 'f1',
  filename: 'msa.pdf',
  size_bytes: 1536,
  status: 'pending' as const,
  ...over
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('KbFileRow — attached row (KBFile)', () => {
  it('renders filename, size, and a Ready badge for attached files', () => {
    render(KbFileRow, { props: { row: attached() } });
    expect(screen.getByText('msa.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders a Remove form posting to ?/detachFile with the file_id', () => {
    render(KbFileRow, { props: { row: attached() } });
    const form = screen.getByRole('form', { name: /remove file/i });
    expect(form).toHaveAttribute('action', '?/detachFile');
    const hidden = form.querySelector('input[name="file_id"]') as HTMLInputElement;
    expect(hidden.value).toBe('f1');
  });

  it('exposes a Download link to the BFF /files/[id]/content route', () => {
    render(KbFileRow, { props: { row: attached() } });
    const link = screen.getByRole('link', { name: /download/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/files/f1/content');
  });

  it('does NOT poll for attached ready rows', async () => {
    render(KbFileRow, { props: { row: attached() } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('KbFileRow — pending row (PendingUpload) polling', () => {
  it('polls /files/{id} every 2 s while status is pending/processing', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 })
    );
    render(KbFileRow, { props: { row: pending() } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledWith('/files/f1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('renders status transitions: Pending → Processing → Ready', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', ingestion_status: 'ready' }), { status: 200 }));
    render(KbFileRow, { props: { row: pending() } });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getByText('Processing')).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
  });

  it('fires exactly ONE ?/attachFile form submit on the ready transition (double-attach guard)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: 'f1', ingestion_status: 'ready' }), { status: 200 })
    );
    const { container } = render(KbFileRow, { props: { row: pending() } });
    const submitSpy = vi.fn((e: Event) => e.preventDefault());
    container.addEventListener('submit', submitSpy, true);

    await vi.advanceTimersByTimeAsync(2000); // first poll → ready → submit
    await vi.advanceTimersByTimeAsync(2000); // would re-fire without the guard
    await vi.advanceTimersByTimeAsync(2000);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const form = submitSpy.mock.calls[0][0].target as HTMLFormElement;
    expect(form.action).toContain('?/attachFile');
    expect((form.querySelector('input[name="file_id"]') as HTMLInputElement).value).toBe('f1');
  });

  it('renders ingestion_error and stops polling on failed status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: 'f1', ingestion_status: 'failed', ingestion_error: 'unsupported_type' }), { status: 200 })
    );
    render(KbFileRow, { props: { row: pending() } });
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getByText(/failed: unsupported_type/i)).toBeInTheDocument());
    (fetch as ReturnType<typeof vi.fn>).mockClear();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops polling and shows Refresh after the 5-minute stuck threshold', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 })
    );
    render(KbFileRow, { props: { row: pending() } });
    // 5 min @ 2s = 150 ticks
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(await screen.findByRole('button', { name: /refresh/i })).toBeInTheDocument();
    (fetch as ReturnType<typeof vi.fn>).mockClear();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('drops the row silently on poll 404 (file deleted elsewhere)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('gone', { status: 404 }));
    const { container } = render(KbFileRow, { props: { row: pending() } });
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(container.textContent).not.toContain('msa.pdf'));
  });
});
