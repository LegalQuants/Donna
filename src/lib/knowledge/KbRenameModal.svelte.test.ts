/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbRenameModal from './KbRenameModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'KB',
	description: null,
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '',
	updated_at: '',
	...over
});

describe('KbRenameModal', () => {
	it('does not render when open is false', () => {
		render(KbRenameModal, { props: { open: false, kb: kb(), onclose: () => {} } });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders a dialog with the KB name prefilled', () => {
		render(KbRenameModal, { props: { open: true, kb: kb({ name: 'Acme' }), onclose: () => {} } });
		const dialog = screen.getByRole('dialog');
		expect(dialog).toBeInTheDocument();
		const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
		expect(nameInput.value).toBe('Acme');
	});

	it('calls onclose on backdrop click', async () => {
		const onclose = vi.fn();
		const { container } = render(KbRenameModal, { props: { open: true, kb: kb(), onclose } });
		const backdrop = container.querySelector('[role="presentation"]') as HTMLElement;
		await fireEvent.click(backdrop);
		expect(onclose).toHaveBeenCalled();
	});

	it('calls onclose on Escape', async () => {
		const onclose = vi.fn();
		render(KbRenameModal, { props: { open: true, kb: kb(), onclose } });
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(onclose).toHaveBeenCalled();
	});

	it('renders a form posting to ?/rename with name + description', () => {
		render(KbRenameModal, {
			props: { open: true, kb: kb({ name: 'Acme', description: 'd' }), onclose: () => {} }
		});
		const form = screen.getByRole('form', { name: 'Rename knowledge base' });
		expect(form).toHaveAttribute('action', '?/rename');
		expect((form.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('Acme');
		expect((form.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value).toBe(
			'd'
		);
	});
});
