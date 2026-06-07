// src/lib/automations/CronInput.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import CronInput from './CronInput.svelte';

describe('CronInput', () => {
	it('shows the humanized preview for the current value', () => {
		render(CronInput, { props: { value: '0 9 * * *', onchange: () => {} } });
		// The preset chip shows the bare label and the preview line is prefixed with ✓,
		// so matching on the ✓ prefix targets the preview unambiguously.
		expect(screen.getByText(/✓ Every day at 9:00/)).toBeInTheDocument();
	});

	it('emits the preset expression when a preset chip is clicked', async () => {
		const onchange = vi.fn();
		render(CronInput, { props: { value: '0 9 * * *', onchange } });
		await fireEvent.click(screen.getByRole('button', { name: /Every weekday at 9:00/ }));
		expect(onchange).toHaveBeenCalledWith('0 9 * * 1-5');
	});

	it('reveals the raw cron input under Advanced and emits on input', async () => {
		const onchange = vi.fn();
		render(CronInput, { props: { value: '0 9 * * *', onchange } });
		expect(screen.queryByLabelText(/cron expression/i)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
		const input = screen.getByLabelText(/cron expression/i);
		await fireEvent.input(input, { target: { value: '15 6 1 * *' } });
		expect(onchange).toHaveBeenCalledWith('15 6 1 * *');
	});

	it('shows the prompt when the value is not a valid cron', () => {
		render(CronInput, { props: { value: 'nope', onchange: () => {} } });
		expect(screen.getByText('Enter a 5-field cron expression')).toBeInTheDocument();
	});

	it('renders a backend error when provided', () => {
		render(CronInput, {
			props: { value: 'nope', error: 'That cron expression is not valid.', onchange: () => {} }
		});
		expect(screen.getByRole('alert')).toHaveTextContent(/not valid/);
	});
});
