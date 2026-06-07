/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PrivilegedChip from './PrivilegedChip.svelte';

describe('PrivilegedChip', () => {
	it('renders the label and a privileged aria-label', () => {
		render(PrivilegedChip);
		const chip = screen.getByLabelText('Privileged matter');
		expect(chip).toBeInTheDocument();
		expect(chip).toHaveTextContent('Privileged');
	});

	it('uses the privileged token background', () => {
		render(PrivilegedChip);
		const chip = screen.getByLabelText('Privileged matter');
		expect(chip.className).toMatch(/bg-mlq-privileged/);
	});
});
