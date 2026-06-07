/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FileRow from './FileRow.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const file = (over = {}) => ({
	id: 'f1',
	owner_id: 'u',
	filename: 'msa.pdf',
	mime_type: 'application/pdf',
	size_bytes: 1536,
	ingestion_status: 'ready' as const,
	created_at: '2026-05-28T00:00:00Z',
	...over
});

describe('FileRow', () => {
	it('renders filename, size, and a Ready badge', () => {
		render(FileRow, { props: { file: file() } });
		expect(screen.getByText('msa.pdf')).toBeInTheDocument();
		expect(screen.getByText('1.5 KB')).toBeInTheDocument();
		expect(screen.getByText('Ready')).toBeInTheDocument();
	});

	it('shows Pending badge when ingestion_status is pending', () => {
		render(FileRow, { props: { file: file({ ingestion_status: 'pending' }) } });
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});

	it('shows Failed badge with error tone when ingestion_status is failed', () => {
		render(FileRow, { props: { file: file({ ingestion_status: 'failed' }) } });
		const badge = screen.getByText('Failed');
		expect(badge.className).toMatch(/text-mlq-error/);
	});

	it('exposes a Download link to the BFF content route', () => {
		render(FileRow, { props: { file: file() } });
		const link = screen.getByRole('link', { name: /download/i }) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/files/f1/content');
	});

	it('renders a Remove form that posts to ?/detachFile with the file_id', () => {
		render(FileRow, { props: { file: file() } });
		const form = screen.getByRole('form', { name: /remove file/i });
		expect(form).toHaveAttribute('action', '?/detachFile');
		const hidden = form.querySelector('input[name="file_id"]') as HTMLInputElement;
		expect(hidden.value).toBe('f1');
	});
});
