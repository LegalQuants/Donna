/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TagInput from './TagInput.svelte';

describe('TagInput', () => {
	it('renders a hidden input per existing tag', () => {
		const { container } = render(TagInput, { props: { tags: ['nda', 'review'] } });
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(2);
		expect((hidden[0] as HTMLInputElement).value).toBe('nda');
	});

	it('adds a normalized tag on Enter and clears the field', async () => {
		const { container } = render(TagInput, { props: { tags: [] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'Due Diligence' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(field.value).toBe('');
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect((hidden[0] as HTMLInputElement).value).toBe('due-diligence');
	});

	it('does not add a duplicate tag', async () => {
		const { container } = render(TagInput, { props: { tags: ['nda'] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'NDA' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(container.querySelectorAll('input[type="hidden"][name="tags"]')).toHaveLength(1);
	});

	it('removes a tag when its remove button is clicked', async () => {
		const { container } = render(TagInput, { props: { tags: ['nda', 'review'] } });
		await fireEvent.click(screen.getByRole('button', { name: 'Remove tag nda' }));
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(1);
		expect((hidden[0] as HTMLInputElement).value).toBe('review');
	});

	it('adds a tag on comma', async () => {
		const { container } = render(TagInput, { props: { tags: [] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'Risk' } });
		await fireEvent.keyDown(field, { key: ',' });
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(1);
		expect((hidden[0] as HTMLInputElement).value).toBe('risk');
	});

	it('removes the last tag on Backspace when the draft is empty', async () => {
		const { container } = render(TagInput, { props: { tags: ['nda', 'review'] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.keyDown(field, { key: 'Backspace' });
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(1);
		expect((hidden[0] as HTMLInputElement).value).toBe('nda');
	});

	it('commits the draft on blur', async () => {
		const { container } = render(TagInput, { props: { tags: [] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'Corporate' } });
		await fireEvent.blur(field);
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect((hidden[0] as HTMLInputElement).value).toBe('corporate');
	});
});
