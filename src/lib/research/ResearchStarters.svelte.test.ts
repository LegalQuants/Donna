import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResearchStarters from './ResearchStarters.svelte';

describe('ResearchStarters', () => {
	it('renders the plain-language intro and example query chips', () => {
		render(ResearchStarters, { onpick: () => {} });
		expect(screen.getByText(/Search U\.S\. case law/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Chevron deference' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Brown v. Board of Education' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'qualified immunity' })).toBeInTheDocument();
	});

	it('calls onpick with the chip text when a chip is clicked', async () => {
		const onpick = vi.fn();
		render(ResearchStarters, { onpick });
		await screen.getByRole('button', { name: 'Chevron deference' }).click();
		expect(onpick).toHaveBeenCalledWith('Chevron deference');
	});
});
