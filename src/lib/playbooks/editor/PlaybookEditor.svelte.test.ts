/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PlaybookEditor from './PlaybookEditor.svelte';
import type { PlaybookCreate } from '../types';

const initial: PlaybookCreate = {
	name: 'NDA',
	contract_type: 'NDA',
	version: '1.0.0',
	description: '',
	positions: [
		{
			issue: 'Confidentiality',
			standard_language: 'L1',
			severity_if_missing: 'high',
			position_order: 0,
			fallback_tiers: [],
			detection_keywords: [],
			detection_examples: []
		},
		{
			issue: 'Term',
			standard_language: 'L2',
			severity_if_missing: 'medium',
			position_order: 1,
			fallback_tiers: [],
			detection_keywords: [],
			detection_examples: []
		}
	]
};

describe('PlaybookEditor', () => {
	it('renders the name field and a summary per position', () => {
		render(PlaybookEditor, { props: { initial, onchange: vi.fn() } });
		expect((screen.getByLabelText(/playbook name/i) as HTMLInputElement).value).toBe('NDA');
		expect(screen.getByRole('button', { name: /^Confidentiality/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^Term/ })).toBeInTheDocument();
	});

	it('editing the name emits the updated PlaybookCreate', async () => {
		const onchange = vi.fn();
		render(PlaybookEditor, { props: { initial, onchange } });
		await fireEvent.input(screen.getByLabelText(/playbook name/i), { target: { value: 'My NDA' } });
		expect(onchange.mock.calls.at(-1)![0].name).toBe('My NDA');
	});

	it('Add position appends a blank position', async () => {
		const onchange = vi.fn();
		render(PlaybookEditor, { props: { initial, onchange } });
		await fireEvent.click(screen.getByRole('button', { name: /add position/i }));
		expect(onchange.mock.calls.at(-1)![0].positions).toHaveLength(3);
	});

	it('Remove drops a position', async () => {
		const onchange = vi.fn();
		render(PlaybookEditor, { props: { initial, onchange } });
		await fireEvent.click(screen.getAllByRole('button', { name: /remove position/i })[0]);
		const last = onchange.mock.calls.at(-1)![0];
		expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual(['Term']);
		expect(last.positions.map((p: { position_order: number }) => p.position_order)).toEqual([0]);
	});

	it('Move down swaps order and reseats position_order', async () => {
		const onchange = vi.fn();
		render(PlaybookEditor, { props: { initial, onchange } });
		await fireEvent.click(screen.getAllByRole('button', { name: /move .* down/i })[0]);
		const last = onchange.mock.calls.at(-1)![0];
		expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual([
			'Term',
			'Confidentiality'
		]);
		expect(last.positions.map((p: { position_order: number }) => p.position_order)).toEqual([0, 1]);
	});
});
