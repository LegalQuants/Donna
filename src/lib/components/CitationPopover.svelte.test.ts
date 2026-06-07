/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CitationPopover from './CitationPopover.svelte';
import { _resetFileCache } from '$lib/citations/files';
import type { Citation } from '$lib/citations/types';

afterEach(() => {
	_resetFileCache();
	vi.unstubAllGlobals();
});

const c: Citation = {
	id: 'c',
	source_file_id: 'f1',
	source_text: 'the indemnity survives',
	source_page: 14,
	partial: false,
	verified: true,
	verification_method: 'exact_match',
	verification_confidence: 1
};

describe('CitationPopover', () => {
	it('shows state label, quote, page, and resolves the filename', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response(JSON.stringify({ filename: 'MSA.pdf' }), { status: 200 }))
		);
		const { getByText, findByText } = render(CitationPopover, { props: { citation: c, index: 1 } });
		expect(getByText(/exact match/i)).toBeInTheDocument();
		expect(getByText('the indemnity survives')).toBeInTheDocument();
		expect(getByText(/Page 14/)).toBeInTheDocument();
		expect(await findByText('MSA.pdf')).toBeInTheDocument();
	});

	it('renders an empty-state when citation is undefined', () => {
		const { getByText } = render(CitationPopover, { props: { citation: undefined, index: 3 } });
		expect(getByText(/could not be matched/i)).toBeInTheDocument();
	});

	it('omits the page line when source_page is absent', () => {
		const { queryByText } = render(CitationPopover, {
			props: { citation: { ...c, source_page: undefined }, index: 1 }
		});
		expect(queryByText(/^Page /)).toBeNull();
	});
});
