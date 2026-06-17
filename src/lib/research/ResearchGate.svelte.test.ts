import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResearchGate from './ResearchGate.svelte';

describe('ResearchGate', () => {
	it('explains research is off and how to enable it', () => {
		render(ResearchGate);
		expect(screen.getByText(/isn't enabled/i)).toBeInTheDocument();
		expect(screen.getByText(/CourtListener/i)).toBeInTheDocument();
	});
});
