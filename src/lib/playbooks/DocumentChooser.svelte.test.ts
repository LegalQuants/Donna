/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://x/playbooks/pb1/run') } }));

import DocumentChooser from './DocumentChooser.svelte';

const props = () => ({
	matters: [{ id: 'm1', name: 'Acme' }],
	matterFiles: [{ id: 'f1', filename: 'nda.pdf', document_id: 'd1' }],
	onupload: vi.fn(),
	onpick: vi.fn()
});

describe('DocumentChooser', () => {
	it('defaults to the Upload tab (dropzone visible)', () => {
		render(DocumentChooser, { props: props() });
		expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
	});
	it('switches to the matter tab and lists ingested files; picking emits the document_id', async () => {
		const p = props();
		render(DocumentChooser, { props: p });
		await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /select nda\.pdf/i }));
		expect(p.onpick).toHaveBeenCalledWith('d1');
	});
});
