/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SkillAttach from './SkillAttach.svelte';
import type { SkillSuggestion } from '$lib/skills/types';

const RESULTS: SkillSuggestion[] = [
	{
		slug: 'nda-review',
		slash_alias: null,
		title: 'NDA Review',
		description: 'Full NDA review',
		scope: 'builtin',
		icon: null
	}
];
const baseProps = () => ({
	results: RESULTS,
	loading: false,
	error: false,
	onopen: vi.fn(),
	onsearch: vi.fn(),
	onattach: vi.fn()
});

afterEach(() => vi.useRealTimers());

describe('SkillAttach', () => {
	it('calls onopen when the button opens the popover, and onattach when a result is clicked', async () => {
		const props = baseProps();
		const { getByTestId } = render(SkillAttach, { props });
		await userEvent.click(getByTestId('skill-attach'));
		expect(props.onopen).toHaveBeenCalledTimes(1);
		await userEvent.click(getByTestId('skill-result-nda-review'));
		expect(props.onattach).toHaveBeenCalledWith(RESULTS[0]);
	});

	it('debounces search input (~200ms) before calling onsearch', async () => {
		vi.useFakeTimers();
		const props = baseProps();
		const { getByTestId } = render(SkillAttach, { props });
		await fireEvent.click(getByTestId('skill-attach'));
		await fireEvent.input(getByTestId('skill-search'), { target: { value: 'nda' } });
		expect(props.onsearch).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		expect(props.onsearch).toHaveBeenCalledWith('nda');
	});

	it('shows an error note when error is set', async () => {
		const props = { ...baseProps(), error: true };
		const { getByTestId, getByText } = render(SkillAttach, { props });
		await userEvent.click(getByTestId('skill-attach'));
		expect(getByText(/couldn't load skills/i)).toBeInTheDocument();
	});
});
