/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import KnowledgeSection from './KnowledgeSection.svelte';
import type { components } from '$lib/api/backend';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

type KnowledgeBase = components['schemas']['KnowledgeBase'];

const kb = (over: Partial<KnowledgeBase>): KnowledgeBase => ({
	id: 'k1',
	name: 'Standards',
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 3,
	chunk_count: 50,
	created_at: '2026-05-28T00:00:00Z',
	updated_at: '2026-05-28T00:00:00Z',
	...over
});

describe('KnowledgeSection', () => {
	it('renders the Knowledge heading', () => {
		render(KnowledgeSection, { props: { kbs: { linked: [], available: [] } } });
		expect(screen.getByRole('heading', { name: /knowledge/i })).toBeInTheDocument();
	});

	it('empty linked state shows the helper line + Link button', () => {
		render(KnowledgeSection, { props: { kbs: { linked: [], available: [kb({ id: 'a' })] } } });
		expect(screen.getByText(/no knowledge bases linked/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /link a knowledge base/i })).toBeInTheDocument();
	});

	it('linked state shows rows with file_count and an Unlink form per row', () => {
		render(KnowledgeSection, {
			props: {
				kbs: { linked: [kb({ id: 'k1', name: 'Linked KB', file_count: 5 })], available: [] }
			}
		});
		expect(screen.getByRole('link', { name: 'Linked KB' })).toBeInTheDocument();
		expect(screen.getByText(/5 files/i)).toBeInTheDocument();
		const form = screen.getByRole('form', { name: /unlink linked kb/i });
		expect(form).toHaveAttribute('action', '?/unlinkKb');
		expect((form.querySelector('input[name="kb_id"]') as HTMLInputElement).value).toBe('k1');
	});

	it('renders a Manage link to /knowledge/[id] for each linked KB', () => {
		render(KnowledgeSection, {
			props: {
				kbs: {
					linked: [
						{
							id: 'k1',
							name: 'Acme',
							owner_id: 'u',
							hybrid_alpha: 0.5,
							file_count: 1,
							chunk_count: 1,
							created_at: '',
							updated_at: ''
						}
					],
					available: []
				}
			}
		});
		const manage = screen.getByRole('link', { name: 'Manage' }) as HTMLAnchorElement;
		expect(manage.getAttribute('href')).toBe('/knowledge/k1');
	});

	it('opens the picker and submits ?/linkKb with the chosen kb_id', async () => {
		render(KnowledgeSection, {
			props: { kbs: { linked: [], available: [kb({ id: 'a', name: 'Alpha' })] } }
		});
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		// Picker shows Alpha; click it. The component should populate a hidden link form and submit.
		// We can verify by checking that a form for linkKb exists with the kb_id after the click.
		const alpha = screen.getByText('Alpha');
		await userEvent.click(alpha);
		const linkForm = screen.getByTestId('link-kb-form') as HTMLFormElement;
		expect(linkForm.getAttribute('action')).toBe('?/linkKb');
		expect((linkForm.querySelector('input[name="kb_id"]') as HTMLInputElement).value).toBe('a');
	});
});
