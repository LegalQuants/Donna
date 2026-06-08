/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TextViewer from './TextViewer.svelte';

afterEach(() => vi.unstubAllGlobals());

function stubContent(body: string, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(body, { status }))
	);
}

describe('TextViewer', () => {
	it('renders markdown through the sanitized renderer', async () => {
		stubContent('# Memo title\n\nA **bold** point.');
		render(TextViewer, {
			props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' }
		});
		expect(await screen.findByRole('heading', { name: 'Memo title' })).toBeInTheDocument();
		expect(screen.getByText('bold')).toBeInTheDocument();
	});
	it('renders plain text preformatted (no markdown interpretation)', async () => {
		stubContent('# not a heading');
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/plain', filename: 'log.txt' } });
		expect(await screen.findByText('# not a heading')).toBeInTheDocument();
		expect(screen.queryByRole('heading')).not.toBeInTheDocument();
	});
	it('fetch failure → error state with a Download fallback link', async () => {
		stubContent('nope', 500);
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' } });
		expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
		const link = screen.getByRole('link', { name: /download/i });
		expect(link).toHaveAttribute('href', '/files/f1/content');
	});
	it('shows a loading state while the fetch is in flight', () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' } });
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});
});
