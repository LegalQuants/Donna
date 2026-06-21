import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ComposerStarters from './ComposerStarters.svelte';

describe('ComposerStarters', () => {
	it('renders an example case-law prompt', () => {
		render(ComposerStarters, { onpick: () => {} });
		expect(screen.getByText(/^Try:/i)).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /landmark U\.S\. Supreme Court case on free speech/i })
		).toBeInTheDocument();
	});

	it('calls onpick with the prompt text when clicked', async () => {
		const onpick = vi.fn();
		render(ComposerStarters, { onpick });
		await screen
			.getByRole('button', { name: /landmark U\.S\. Supreme Court case on free speech/i })
			.click();
		expect(onpick).toHaveBeenCalledWith(
			'Find a landmark U.S. Supreme Court case on free speech and cite it'
		);
	});
});
