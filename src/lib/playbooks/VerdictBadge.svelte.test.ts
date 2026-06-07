/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import VerdictBadge from './VerdictBadge.svelte';

describe('VerdictBadge', () => {
	it('renders the verdict label', () => {
		render(VerdictBadge, { props: { verdict: 'deviates' } });
		expect(screen.getByText('Deviates')).toBeInTheDocument();
	});
	it('appends the fallback rank when matches_fallback with a rank', () => {
		render(VerdictBadge, { props: { verdict: 'matches_fallback', fallbackRank: 1 } });
		expect(screen.getByText(/Fallback · tier 1/)).toBeInTheDocument();
	});
	it('uses the error token for missing', () => {
		render(VerdictBadge, { props: { verdict: 'missing' } });
		expect(screen.getByText('Missing').className).toMatch(/mlq-error/);
	});
});
