/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import SegmentedControl from './SegmentedControl.svelte';

const options = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' }
];

describe('SegmentedControl', () => {
	it('renders options as a radiogroup and marks the active one', () => {
		render(SegmentedControl, { props: { options, value: 'a', label: 'Test' } });
		expect(screen.getByRole('radiogroup', { name: 'Test' })).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false');
	});

	it('fires onchange with the value when an inactive option is clicked', async () => {
		const onchange = vi.fn();
		render(SegmentedControl, { props: { options, value: 'a', label: 'Test', onchange } });
		await fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
		expect(onchange).toHaveBeenCalledWith('b');
	});
});
