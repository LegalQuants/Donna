/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ContextSection from './ContextSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('ContextSection', () => {
	it('renders the Context heading and the helper line', () => {
		render(ContextSection, { props: { value: '' } });
		expect(screen.getByRole('heading', { name: /context/i })).toBeInTheDocument();
		expect(screen.getByText(/markdown notes the assistant sees/i)).toBeInTheDocument();
	});

	it('seeds the textarea from the value prop', () => {
		render(ContextSection, { props: { value: '## Notes' } });
		expect(
			(screen.getByRole('textbox', { name: /matter context/i }) as HTMLTextAreaElement).value
		).toBe('## Notes');
	});

	it('Save button is disabled when the value equals the seeded value', () => {
		render(ContextSection, { props: { value: 'init' } });
		expect(screen.getByRole('button', { name: /save context/i })).toBeDisabled();
	});

	it('Save button enables when the textarea changes', async () => {
		render(ContextSection, { props: { value: 'init' } });
		await fireEvent.input(screen.getByRole('textbox', { name: /matter context/i }), {
			target: { value: 'changed' }
		});
		expect(screen.getByRole('button', { name: /save context/i })).toBeEnabled();
	});

	it('shows a byte counter and goes red over the 102_400-byte cap', async () => {
		render(ContextSection, { props: { value: '' } });
		const ta = screen.getByRole('textbox', { name: /matter context/i });
		await fireEvent.input(ta, { target: { value: 'A'.repeat(50) } });
		const counter = screen.getByTestId('context-bytes');
		expect(counter).toHaveTextContent('50 / 102400 bytes');
		expect(counter.className).not.toMatch(/text-mlq-error/);

		await fireEvent.input(ta, { target: { value: 'A'.repeat(102_401) } });
		expect(counter.className).toMatch(/text-mlq-error/);
		expect(screen.getByRole('button', { name: /save context/i })).toBeDisabled();
	});

	it('counts UTF-8 bytes (not characters) for multi-byte input', async () => {
		render(ContextSection, { props: { value: '' } });
		await fireEvent.input(screen.getByRole('textbox', { name: /matter context/i }), {
			target: { value: '日' }
		}); // 3 UTF-8 bytes
		expect(screen.getByTestId('context-bytes')).toHaveTextContent('3 / 102400 bytes');
	});

	it('wraps the form posting to ?/saveContext', () => {
		render(ContextSection, { props: { value: '' } });
		const form = screen.getByRole('form', { name: /matter context/i });
		expect(form).toHaveAttribute('action', '?/saveContext');
	});
});
