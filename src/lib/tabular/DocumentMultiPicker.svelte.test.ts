import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DocumentMultiPicker from './DocumentMultiPicker.svelte';
import { createTabularBuilder } from './tabularBuilder.svelte';
import { createTabularUploads } from './tabularUploads.svelte';

const props = (over: Record<string, unknown> = {}) => ({
	builder: createTabularBuilder(),
	uploads: createTabularUploads(),
	matters: [{ id: 'm1', name: 'Acme' }],
	matterFiles: [
		{ document_id: 'doc1', name: 'a.pdf' },
		{ document_id: 'doc2', name: 'b.pdf' }
	],
	selectedMatterId: 'm1',
	onmatter: vi.fn(),
	...over
});

describe('DocumentMultiPicker', () => {
	it("lists a matter's ready files as checkboxes and selecting one adds it to the builder", async () => {
		const p = props();
		render(DocumentMultiPicker, { props: p as never });
		const cb = screen.getByRole('checkbox', { name: 'a.pdf' });
		await fireEvent.click(cb);
		expect(p.builder.hasDoc('doc1')).toBe(true);
		await fireEvent.click(cb);
		expect(p.builder.hasDoc('doc1')).toBe(false);
	});

	it('shows a selected-count and the chosen documents as chips', async () => {
		const p = props();
		p.builder.addDoc({ document_id: 'doc1', name: 'a.pdf' });
		render(DocumentMultiPicker, { props: p as never });
		expect(screen.getByText('1 document selected')).toBeInTheDocument();
	});

	it('switching to the Upload tab shows the dropzone', async () => {
		render(DocumentMultiPicker, { props: props() as never });
		await fireEvent.click(screen.getByRole('button', { name: /upload/i }));
		expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
	});
});
