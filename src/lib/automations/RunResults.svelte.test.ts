/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RunResults from './RunResults.svelte';
import type { FindingItem, RunMemoryItem } from './findings';
import type { ArtifactItem } from './artifacts';

const f = (id: string, severity: string, title: string): FindingItem => ({
	id,
	severity,
	title,
	content: 'body',
	created_at: '2026-06-05T10:00:00Z'
});
const m = (id: string, state: string): RunMemoryItem => ({
	id,
	state,
	category: 'preference',
	content: 'Likes brevity',
	created_at: '2026-06-05T10:01:00Z'
});
const base = {
	findings: [] as FindingItem[] | null,
	findingsTotal: 0 as number | null,
	memories: [] as RunMemoryItem[] | null,
	memoriesTotal: null as number | null,
	running: false,
	artifacts: null as ArtifactItem[] | null,
	artifactsTotal: null as number | null
};

describe('RunResults', () => {
	it('renders findings in emission order with a severity summary', () => {
		render(RunResults, {
			props: {
				...base,
				findings: [f('f1', 'info', 'First emitted'), f('f2', 'critical', 'Second emitted')],
				findingsTotal: 2
			}
		});
		expect(screen.getByText('1 critical · 1 info')).toBeInTheDocument();
		const titles = screen.getAllByText(/emitted$/).map((el) => el.textContent);
		expect(titles).toEqual(['First emitted', 'Second emitted']); // ASC emission order — NOT severity-grouped
	});
	it('shows the overflow note when total exceeds the fetched page', () => {
		render(RunResults, {
			props: { ...base, findings: [f('f1', 'info', 'Only one shown')], findingsTotal: 250 }
		});
		expect(screen.getByText('+249 more findings not shown.')).toBeInTheDocument();
	});
	it('terminal + zero findings → recorded-none empty state', () => {
		render(RunResults, { props: { ...base } });
		expect(screen.getByText('This run recorded no findings.')).toBeInTheDocument();
	});
	it('running + zero findings → "No findings yet." and running sub-copy', () => {
		render(RunResults, { props: { ...base, running: true } });
		expect(screen.getByText('No findings yet.')).toBeInTheDocument();
		expect(screen.getByText(/still working/)).toBeInTheDocument();
	});
	it('null findings → unavailable message', () => {
		render(RunResults, { props: { ...base, findings: null, findingsTotal: null } });
		expect(screen.getByText('Results unavailable right now.')).toBeInTheDocument();
	});
	it('renders the memories sub-section with state chips only when non-empty', () => {
		const { rerender } = render(RunResults, {
			props: { ...base, memories: [m('m1', 'proposed'), m('m2', 'kept')] }
		});
		expect(screen.getByText('Memories this run proposed')).toBeInTheDocument();
		expect(screen.getByText('proposed')).toBeInTheDocument();
		expect(screen.getByText('kept')).toBeInTheDocument();
		rerender({ ...base, memories: [] });
		expect(screen.queryByText('Memories this run proposed')).toBeNull();
	});
	it('hides the memories sub-section when memories is null (fetch failed)', () => {
		render(RunResults, { props: { ...base, memories: null } });
		expect(screen.queryByText('Memories this run proposed')).toBeNull();
	});
	it('shows memories overflow note when memoriesTotal exceeds fetched count', () => {
		render(RunResults, {
			props: {
				...base,
				memories: [m('m1', 'proposed')],
				memoriesTotal: 5
			}
		});
		expect(screen.getByText(/\+4 more/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Automations → Review/i })).toHaveAttribute(
			'href',
			'/automations/review'
		);
	});
	it('hides memories overflow note when memoriesTotal equals memories length', () => {
		render(RunResults, {
			props: {
				...base,
				memories: [m('m1', 'proposed')],
				memoriesTotal: 1
			}
		});
		expect(screen.queryByText(/more — review all/)).toBeNull();
	});
	it('hides memories overflow note when memoriesTotal is null', () => {
		render(RunResults, {
			props: {
				...base,
				memories: [m('m1', 'proposed')],
				memoriesTotal: null
			}
		});
		expect(screen.queryByText(/more — review all/)).toBeNull();
	});
	it('proposed memory rows show Keep and Dismiss buttons', () => {
		render(RunResults, {
			props: { ...base, memories: [m('m1', 'proposed')] }
		});
		expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
	});
	it('kept memory rows show no Keep/Dismiss buttons', () => {
		render(RunResults, {
			props: { ...base, memories: [m('m1', 'kept')] }
		});
		expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
	});
});

const a = (id: string, over: Partial<ArtifactItem> = {}): ArtifactItem => ({
	id,
	name: 'DPA memo.md',
	mime: 'text/markdown',
	size_bytes: 4608,
	file_id: 'f1',
	document_id: 'd1',
	created_at: '2026-06-07T10:00:00Z',
	...over
});

describe('RunResults documents', () => {
	it('hidden when artifacts are null or empty', () => {
		render(RunResults, { props: { ...base, artifacts: null } });
		expect(screen.queryByText('Documents')).not.toBeInTheDocument();
		render(RunResults, { props: { ...base, artifacts: [] } });
		expect(screen.queryByText('Documents')).not.toBeInTheDocument();
	});
	it('renders a row with name, size, Open, and Download', async () => {
		const onopenartifact = vi.fn();
		render(RunResults, {
			props: { ...base, artifacts: [a('a1')], artifactsTotal: 1, onopenartifact }
		});
		expect(screen.getByText('Documents')).toBeInTheDocument();
		expect(screen.getByText('DPA memo.md')).toBeInTheDocument();
		expect(screen.getByText('4.5 KB')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
			'href',
			'/files/f1/content'
		);
		await fireEvent.click(screen.getByRole('button', { name: /open/i }));
		expect(onopenartifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
	});
	it('deleted-file row: metadata only, no actions', () => {
		render(RunResults, {
			props: {
				...base,
				artifacts: [a('a1', { file_id: null, document_id: null })],
				artifactsTotal: 1
			}
		});
		expect(screen.getByText('DPA memo.md')).toBeInTheDocument();
		expect(screen.getByText(/file deleted/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
	});
	it('overflow note when total exceeds the fetched page', () => {
		render(RunResults, {
			props: { ...base, artifacts: [a('a1')], artifactsTotal: 3 }
		});
		expect(screen.getByText('+2 more documents not shown.')).toBeInTheDocument();
	});
});
