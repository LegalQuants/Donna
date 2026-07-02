import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/about/fiduciary page', () => {
	it('names the four trust states', () => {
		render(Page);
		// Labels sit in <strong> inside <li>/<p>, so both the inner and outer element
		// match an un-anchored regex — assert at least one match rather than exactly one.
		for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
			expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
	});
	it('embeds the trust-states playground', () => {
		const { container } = render(Page);
		const iframe = container.querySelector('iframe');
		expect(iframe).toHaveAttribute('src', '/learn/playgrounds/trust-states.html');
	});
	it('drills into the citation-engine-cascade playground for the verification mechanism', () => {
		render(Page);
		const link = screen.getByRole('link', { name: /how a quote is verified/i });
		expect(link).toHaveAttribute('href', '/learn/playgrounds/citation-engine-cascade.html');
	});
	it('carries the honest caveats (derived-not-editorial, not a signed attestation)', () => {
		render(Page);
		expect(screen.getAllByText(/derived, not editorial/i).length).toBeGreaterThan(0);
		expect(
			screen.getAllByText(/not a (cryptographically )?signed attestation/i).length
		).toBeGreaterThan(0);
	});
	it('drills into each of the 5 fiduciary playgrounds and drops the stale "on the way" prose', () => {
		const { container } = render(Page);
		for (const slug of [
			'authority-sources',
			'citation-ledger',
			'fiduciary-gate',
			'treatment-layer',
			'matter-session-flow'
		])
			expect(container.querySelector(`a[href="/learn/playgrounds/${slug}.html"]`)).not.toBeNull();
		expect(screen.queryByText(/on the way from the LQ-AI engine/i)).not.toBeInTheDocument();
	});
});
