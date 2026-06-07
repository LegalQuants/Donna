/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DataExportCard from './DataExportCard.svelte';
import type { ExportJob } from './dataPrivacy';

type Result = { type: string; data?: Record<string, unknown> };
type PostCb = (args: { result: Result; update: () => Promise<void> }) => Promise<void>;
type SubmitFn = () => PostCb;

const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
	enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
		hoisted.submit = submit;
		return {};
	}
}));

async function deliver(result: Result) {
	const post = hoisted.submit!();
	await post({ result, update: async () => {} });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('DataExportCard', () => {
	it('shows the Export button when idle', () => {
		render(DataExportCard);
		expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
	});

	it('shows progress after a queued job and disables the button', async () => {
		render(DataExportCard);
		await deliver({
			type: 'success',
			data: { export: { job_id: 'j1', status: 'queued', download_url: null } as ExportJob }
		});
		expect(screen.getByText(/preparing your export/i)).toBeInTheDocument();
	});

	it('shows the download link when polling reports completed', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					job_id: 'j1',
					status: 'completed',
					download_url: 'https://minio/x.zip'
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		render(DataExportCard);
		await deliver({
			type: 'success',
			data: { export: { job_id: 'j1', status: 'processing', download_url: null } as ExportJob }
		});
		await vi.advanceTimersByTimeAsync(2000);
		const link = await screen.findByRole('link', { name: /download archive/i });
		expect(link).toHaveAttribute('href', 'https://minio/x.zip');
		expect(fetchMock).toHaveBeenCalledWith('/settings/data/export/j1');
	});

	it('shows the failed state with a retry when polling reports failed', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ job_id: 'j1', status: 'failed', download_url: null }), {
				status: 200
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(DataExportCard);
		await deliver({
			type: 'success',
			data: { export: { job_id: 'j1', status: 'processing', download_url: null } as ExportJob }
		});
		await vi.advanceTimersByTimeAsync(2000);
		expect(await screen.findByText(/export failed/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
	});

	it('surfaces an inline error on a failed submit', async () => {
		render(DataExportCard);
		await deliver({ type: 'failure', data: { exportError: 'Could not start the export.' } });
		expect(await screen.findByText('Could not start the export.')).toBeInTheDocument();
	});
});
