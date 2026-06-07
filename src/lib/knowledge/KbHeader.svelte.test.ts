/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbHeader from './KbHeader.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'Acme',
	description: 'd',
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 6,
	chunk_count: 412,
	created_at: '',
	updated_at: '',
	...over
});

describe('KbHeader', () => {
	it('renders the KB name and counts', () => {
		render(KbHeader, { props: { kb: kb() } });
		expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
		expect(screen.getByText(/6 files/i)).toBeInTheDocument();
		expect(screen.getByText(/412 chunks/i)).toBeInTheDocument();
	});

	it('opens the rename modal on Rename click', async () => {
		render(KbHeader, { props: { kb: kb() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		expect(screen.getByRole('dialog', { name: 'Rename knowledge base' })).toBeInTheDocument();
	});

	it('renders an Archive form posting to ?/archive', () => {
		render(KbHeader, { props: { kb: kb() } });
		const form = screen.getByRole('form', { name: 'Archive knowledge base' });
		expect(form).toHaveAttribute('action', '?/archive');
	});
});
