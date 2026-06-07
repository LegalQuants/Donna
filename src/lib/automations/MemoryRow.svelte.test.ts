// src/lib/automations/MemoryRow.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import MemoryRow from './MemoryRow.svelte';
import type { MemoryEntry } from './memory';

const mem = (over: Partial<MemoryEntry> = {}): MemoryEntry => ({
	id: 'm1',
	state: 'proposed',
	category: 'workflow',
	content: 'Prefers concise summaries.',
	source_session_id: 's1',
	created_at: '2026-06-07T09:00:00Z',
	...over
});

describe('MemoryRow', () => {
	it('proposed: shows chip/category/content, Keep + Edit & keep + Dismiss, and the run link', () => {
		render(MemoryRow, { props: { memory: mem() } });
		expect(screen.getByText('proposed')).toBeInTheDocument();
		expect(screen.getByText('workflow')).toBeInTheDocument();
		expect(screen.getByText('Prefers concise summaries.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Edit & keep' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /from run/i })).toHaveAttribute(
			'href',
			'/automations/s1'
		);
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	it('Edit & keep expands a textarea seeded with the content; Cancel collapses', async () => {
		render(MemoryRow, { props: { memory: mem() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit & keep' }));
		const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
		expect(ta.value).toBe('Prefers concise summaries.');
		expect(ta.name).toBe('content');
		expect(screen.getByRole('button', { name: 'Save & keep' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('textbox')).toBeNull();
	});

	it('kept: two-step delete only', async () => {
		render(MemoryRow, { props: { memory: mem({ state: 'kept' }) } });
		expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(screen.getByText('Delete memory?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Delete memory?')).toBeNull();
	});

	it('unknown state renders neutrally and treats it like kept/dismissed (delete only)', () => {
		render(MemoryRow, { props: { memory: mem({ state: 'weird' }) } });
		expect(screen.getByText('weird')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('row-scoped error renders as alert; no run link when source_session_id null', () => {
		render(MemoryRow, {
			props: { memory: mem({ source_session_id: null }), error: 'This memory no longer exists.' }
		});
		expect(screen.getByRole('alert')).toHaveTextContent('This memory no longer exists.');
		expect(screen.queryByRole('link', { name: /from run/i })).toBeNull();
	});
});
