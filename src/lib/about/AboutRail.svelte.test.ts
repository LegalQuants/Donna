import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AboutRail from './AboutRail.svelte';

describe('AboutRail', () => {
	it('links the Research and Tools & connections guide pages', () => {
		render(AboutRail);
		const research = screen.getByRole('link', { name: 'Research' });
		expect(research).toHaveAttribute('href', '/about/research');
		const tools = screen.getByRole('link', { name: 'Tools & connections' });
		expect(tools).toHaveAttribute('href', '/about/tools');
	});

	it('links the Fiduciary receipts guide page', () => {
		render(AboutRail);
		const fiduciary = screen.getByRole('link', { name: 'Fiduciary receipts' });
		expect(fiduciary).toHaveAttribute('href', '/about/fiduciary');
	});
});
