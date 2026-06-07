/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WorkflowsNav from './WorkflowsNav.svelte';

describe('WorkflowsNav', () => {
	it('renders four segments linking to the tool routes', () => {
		render(WorkflowsNav, { props: { active: null } });
		expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
		expect(screen.getByRole('link', { name: 'Playbooks' })).toHaveAttribute('href', '/playbooks');
		expect(screen.getByRole('link', { name: 'Prompts' })).toHaveAttribute('href', '/prompts');
		expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute(
			'href',
			'/automations'
		);
	});

	it('marks the active segment with aria-current and no others', () => {
		render(WorkflowsNav, { props: { active: 'playbooks' } });
		expect(screen.getByRole('link', { name: 'Playbooks' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Skills' })).not.toHaveAttribute('aria-current');
		expect(screen.getByRole('link', { name: 'Prompts' })).not.toHaveAttribute('aria-current');
	});

	it('marks Automations active with aria-current when active is automations', () => {
		render(WorkflowsNav, { props: { active: 'automations' } });
		expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(screen.getByRole('link', { name: 'Skills' })).not.toHaveAttribute('aria-current');
		expect(screen.getByRole('link', { name: 'Playbooks' })).not.toHaveAttribute('aria-current');
		expect(screen.getByRole('link', { name: 'Prompts' })).not.toHaveAttribute('aria-current');
	});

	it('marks no segment active when active is null (the hub)', () => {
		render(WorkflowsNav, { props: { active: null } });
		for (const name of ['Skills', 'Playbooks', 'Prompts', 'Automations']) {
			expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
		}
	});

	it('exposes the sub-nav as a labelled navigation landmark', () => {
		render(WorkflowsNav, { props: { active: 'skills' } });
		expect(screen.getByRole('navigation', { name: 'Workflows sections' })).toBeInTheDocument();
	});
});
