/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SkillsSection from './SkillsSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('SkillsSection', () => {
	it('renders the Skills heading', () => {
		render(SkillsSection, { props: { attached: [] } });
		expect(screen.getByRole('heading', { name: /skills/i })).toBeInTheDocument();
	});

	it('empty state shows the ⊕ Skill trigger and no chips', () => {
		render(SkillsSection, { props: { attached: [] } });
		expect(screen.getByRole('button', { name: /attach skill/i })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
	});

	it('renders one chip per attached skill', () => {
		render(SkillsSection, { props: { attached: ['redline', 'summarize'] } });
		expect(screen.getByText('redline')).toBeInTheDocument();
		expect(screen.getByText('summarize')).toBeInTheDocument();
	});

	it('each chip has a Remove form that posts ?/detachSkill with the skill_name', () => {
		render(SkillsSection, { props: { attached: ['redline'] } });
		const form = screen.getByRole('form', { name: /remove redline/i });
		expect(form).toHaveAttribute('action', '?/detachSkill');
		expect((form.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe(
			'redline'
		);
	});

	it('opening the picker fetches /skills/autocomplete; clicking a result populates the attach form and submits', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ results: [{ slug: 'redline', title: 'Redline', scope: 'builtin' }] }),
					{ status: 200 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		render(SkillsSection, { props: { attached: [] } });
		await userEvent.click(screen.getByRole('button', { name: /attach skill/i }));
		// The autocomplete fires; await a tick.
		await new Promise((r) => setTimeout(r, 0));
		await userEvent.click(screen.getByText('Redline'));
		const attachForm = screen.getByTestId('attach-skill-form') as HTMLFormElement;
		expect(attachForm.getAttribute('action')).toBe('?/attachSkill');
		expect((attachForm.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe(
			'redline'
		);
		vi.unstubAllGlobals();
	});
});
