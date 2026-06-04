import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LqLearnSection from './LqLearnSection.svelte';
import type { LqLearnSection as Section } from './lqLearnSections';

const section: Section = {
	number: 1,
	title: 'The big picture: System Architecture',
	paragraphs: ['First para.', 'Second para.'],
	playground: 'system-architecture',
	sourceLabel: 'docs/architecture.md',
	sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/architecture.md'
};

describe('LqLearnSection', () => {
	it('renders the numbered heading, prose, iframe, and foot links', () => {
		const { container } = render(LqLearnSection, { props: { section } as never });
		expect(
			screen.getByRole('heading', {
				name: '1. The big picture: System Architecture',
				level: 2
			})
		).toBeInTheDocument();
		expect(screen.getByText('First para.')).toBeInTheDocument();
		expect(screen.getByText('Second para.')).toBeInTheDocument();

		const iframe = container.querySelector('iframe')!;
		expect(iframe.getAttribute('src')).toBe('/learn/playgrounds/system-architecture.html');
		expect(iframe.getAttribute('loading')).toBe('lazy');
		expect(iframe.getAttribute('title')).toContain('System Architecture');

		const full = screen.getByRole('link', { name: /open full-screen/i });
		expect(full.getAttribute('href')).toBe('/learn/playgrounds/system-architecture.html');
		const source = screen.getByRole('link', { name: 'docs/architecture.md' });
		expect(source.getAttribute('href')).toBe(section.sourceUrl);
	});
});
