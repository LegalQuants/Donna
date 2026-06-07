/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PositionCard from './PositionCard.svelte';
import type { Position } from './types';

const full = (over: Partial<Position> = {}): Position =>
	({
		id: 'p1',
		issue: 'Processor Obligations',
		description: 'Must process on documented instructions.',
		standard_language:
			'The Processor shall process Personal Data solely on documented instructions.',
		fallback_tiers: [{ rank: 1, description: 'softer', language: 'Tier-1 language.' }],
		redline_strategy: 'Insert the chapeau verbatim.',
		severity_if_missing: 'critical',
		detection_keywords: ['documented instructions', 'Article 28'],
		detection_examples: ['Processor processes data only as instructed.'],
		position_order: 0,
		...over
	}) as Position;

describe('PositionCard', () => {
	it('shows issue, severity, description and standard language by default', () => {
		render(PositionCard, { props: { position: full() } });
		expect(screen.getByText('Processor Obligations')).toBeInTheDocument();
		expect(screen.getByText('Critical')).toBeInTheDocument();
		expect(screen.getByText(/Must process on documented instructions/)).toBeInTheDocument();
		expect(
			screen.getByText(/process Personal Data solely on documented instructions/)
		).toBeInTheDocument();
	});
	it('hides matcher internals until the toggle is clicked', async () => {
		render(PositionCard, { props: { position: full() } });
		expect(screen.queryByText('Detection keywords')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /show matching details/i }));
		expect(screen.getByText('Detection keywords')).toBeInTheDocument();
		expect(screen.getByText('documented instructions')).toBeInTheDocument();
		expect(screen.getByText('Fallback tiers')).toBeInTheDocument();
		expect(screen.getByText(/Insert the chapeau verbatim/)).toBeInTheDocument();
	});
	it('shows no toggle when there are no internals', () => {
		render(PositionCard, {
			props: {
				position: full({
					fallback_tiers: [],
					redline_strategy: undefined,
					detection_keywords: [],
					detection_examples: []
				})
			}
		});
		expect(screen.queryByRole('button', { name: /matching details/i })).toBeNull();
	});
	it('renders a draft PositionCreate (no id)', () => {
		const draftPos = {
			issue: 'Compelled Disclosure',
			description: 'Notice + cooperation on legal compulsion.',
			standard_language: 'The Receiving Party may disclose when legally compelled…',
			fallback_tiers: [],
			redline_strategy: undefined,
			severity_if_missing: 'high',
			detection_keywords: [],
			detection_examples: [],
			position_order: 0
		} as unknown as import('./types').PositionCreate;
		render(PositionCard, { props: { position: draftPos } });
		expect(screen.getByText('Compelled Disclosure')).toBeInTheDocument();
		expect(screen.getByText(/legally compelled/)).toBeInTheDocument();
	});
});
