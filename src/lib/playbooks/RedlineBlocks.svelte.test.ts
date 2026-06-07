/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineBlocks from './RedlineBlocks.svelte';

const redline = {
	old_text: 'survive for five (5) years',
	new_text: 'survive for so long as it remains a trade secret',
	justification: 'Align with standard.'
};

describe('RedlineBlocks', () => {
	it('renders the old text struck-through and the new text', () => {
		render(RedlineBlocks, { props: { redline } });
		const oldEl = screen.getByText(/survive for five \(5\) years/);
		expect(oldEl.className).toMatch(/line-through/);
		expect(screen.getByText(/so long as it remains a trade secret/)).toBeInTheDocument();
	});
	it('renders the redline justification', () => {
		render(RedlineBlocks, { props: { redline } });
		expect(screen.getByText(/Align with standard/)).toBeInTheDocument();
	});
});
