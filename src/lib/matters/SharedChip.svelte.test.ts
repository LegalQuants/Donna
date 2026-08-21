/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SharedChip from './SharedChip.svelte';

describe('SharedChip', () => {
	it('distinguishes a matter somebody put you on from one nobody had to', () => {
		render(SharedChip, { props: { basis: 'member' } });
		expect(screen.getByText('Shared')).toBeInTheDocument();
		expect(screen.getByLabelText(/added to this matter by someone else/i)).toBeInTheDocument();
	});

	it('labels firm-wide readability as such', () => {
		render(SharedChip, { props: { basis: 'org' } });
		expect(screen.getByText('Firm-wide')).toBeInTheDocument();
		expect(screen.getByLabelText(/readable by everyone at the firm/i)).toBeInTheDocument();
	});
});
