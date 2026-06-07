import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import TableSkillPicker from './TableSkillPicker.svelte';
import type { TableSkillSummary } from './types';

const skills: TableSkillSummary[] = [
	{
		name: 'contract-snapshot',
		title: 'Contract Snapshot',
		description: 'Key terms across contracts'
	},
	{ name: 'nda-snapshot', title: 'NDA Snapshot', description: null }
];

describe('TableSkillPicker', () => {
	it('lists skills and calls onselect with the chosen skill', async () => {
		const onselect = vi.fn();
		render(TableSkillPicker, { props: { skills, selected: null, onselect } as never });
		await fireEvent.click(screen.getByText('Contract Snapshot'));
		expect(onselect).toHaveBeenCalledWith(skills[0]);
	});

	it('filters by the search query', async () => {
		render(TableSkillPicker, { props: { skills, selected: null, onselect: () => {} } as never });
		await fireEvent.input(screen.getByLabelText(/search table skills/i), {
			target: { value: 'nda' }
		});
		expect(screen.queryByText('Contract Snapshot')).not.toBeInTheDocument();
		expect(screen.getByText('NDA Snapshot')).toBeInTheDocument();
	});

	it('shows an empty state when there are no table skills', () => {
		render(TableSkillPicker, {
			props: { skills: [], selected: null, onselect: () => {} } as never
		});
		expect(screen.getByText(/no table skills/i)).toBeInTheDocument();
	});
});
