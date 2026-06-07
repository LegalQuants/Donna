// src/lib/automations/ProposalRow.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ProposalRow from './ProposalRow.svelte';
import type { ProposalEntry } from './precedents';

const proposal = (over: Partial<ProposalEntry> = {}): ProposalEntry => ({
	id: 'pr1',
	precedent_id: 'p1',
	project_id: 'proj1',
	suggested_md: '## Precedent\nVendor accepts 30-day termination.',
	state: 'proposed',
	created_at: '2026-06-07T09:00:00Z',
	...over
});

describe('ProposalRow', () => {
	it('renders matter name, suggested_md, Accept + Reject', () => {
		render(ProposalRow, { props: { proposal: proposal(), matterName: 'Acme MSA' } });
		expect(screen.getByText(/for matter:.*acme msa/i)).toBeInTheDocument();
		expect(screen.getByText(/vendor accepts 30-day termination/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
	});

	it('falls back to project_id when matterName is null', () => {
		render(ProposalRow, { props: { proposal: proposal(), matterName: null } });
		expect(screen.getByText(/for matter:.*proj1/i)).toBeInTheDocument();
	});

	it('two-step accept: Confirm accept/Cancel', async () => {
		render(ProposalRow, { props: { proposal: proposal(), matterName: 'Acme MSA' } });
		await fireEvent.click(screen.getByRole('button', { name: /accept/i }));
		expect(screen.getByText("Add this to the matter's context?")).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm accept' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText("Add this to the matter's context?")).toBeNull();
	});

	it('error prop renders as alert', () => {
		render(ProposalRow, {
			props: { proposal: proposal(), matterName: 'Acme MSA', error: 'Context document is full.' }
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Context document is full.');
	});

	it('accept form contains a hidden project_id input with the proposal project_id value', async () => {
		const { container } = render(ProposalRow, {
			props: { proposal: proposal({ project_id: 'proj1' }), matterName: 'Acme MSA' }
		});
		// Reveal the confirm step
		await fireEvent.click(screen.getByRole('button', { name: /accept/i }));
		const form = container.querySelector('form[action*="acceptProposal"]');
		expect(form).not.toBeNull();
		const projectIdInput = form!.querySelector(
			'input[name="project_id"]'
		) as HTMLInputElement | null;
		expect(projectIdInput).not.toBeNull();
		expect(projectIdInput!.type).toBe('hidden');
		expect(projectIdInput!.value).toBe('proj1');
	});
});
