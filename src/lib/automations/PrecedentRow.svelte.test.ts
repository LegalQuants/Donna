// src/lib/automations/PrecedentRow.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PrecedentRow from './PrecedentRow.svelte';
import type { PrecedentEntry } from './precedents';

const precedent = (over: Partial<PrecedentEntry> = {}): PrecedentEntry => ({
	id: 'p1',
	pattern_kind: 'recurring-clause',
	summary: 'Vendor repeatedly accepts 30-day termination.',
	observed_count: 3,
	source_session_id: 's1',
	created_at: '2026-06-07T09:00:00Z',
	...over
});

const matters = [{ id: 'proj1', name: 'Acme MSA' }];

describe('PrecedentRow', () => {
	it('renders chip/summary/"seen 3×"/run-link; Dismiss + Promote… visible', () => {
		render(PrecedentRow, { props: { precedent: precedent(), matters } });
		expect(screen.getByText('recurring-clause')).toBeInTheDocument();
		expect(screen.getByText('Vendor repeatedly accepts 30-day termination.')).toBeInTheDocument();
		expect(screen.getByText(/seen 3×/i)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /from run/i })).toHaveAttribute(
			'href',
			'/automations/s1'
		);
		expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument();
	});

	it('two-step dismiss confirm shows/cancels', async () => {
		render(PrecedentRow, { props: { precedent: precedent(), matters } });
		await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
		expect(screen.getByText('Dismiss precedent?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm dismiss' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Dismiss precedent?')).toBeNull();
	});

	it('Promote… expands: MatterPicker present, submit disabled; pick matter → enabled; hidden project_id = proj1; Cancel collapses', async () => {
		const { container } = render(PrecedentRow, { props: { precedent: precedent(), matters } });
		await fireEvent.click(screen.getByRole('button', { name: /promote/i }));

		// MatterPicker trigger present
		const pickerTrigger = screen.getByRole('button', { name: 'Choose matter' });
		expect(pickerTrigger).toBeInTheDocument();

		// "Create proposal" is disabled while no matter selected
		const submitBtn = screen.getByRole('button', { name: 'Create proposal' });
		expect(submitBtn).toBeDisabled();

		// Open picker and click 'Acme MSA'
		await fireEvent.click(pickerTrigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Acme MSA' }));

		// Now the trigger should reflect the selection
		expect(screen.getByRole('button', { name: 'Matter: Acme MSA' })).toBeInTheDocument();

		// Submit is now enabled
		expect(screen.getByRole('button', { name: 'Create proposal' })).not.toBeDisabled();

		// Hidden project_id input has the correct value
		const projectIdInput = container.querySelector('input[name="project_id"]') as HTMLInputElement;
		expect(projectIdInput).not.toBeNull();
		expect(projectIdInput.value).toBe('proj1');

		// Cancel collapses the panel
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('button', { name: 'Create proposal' })).toBeNull();
	});

	it('error prop renders as alert', () => {
		render(PrecedentRow, {
			props: { precedent: precedent(), matters, error: 'Could not dismiss.' }
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Could not dismiss.');
	});
});
