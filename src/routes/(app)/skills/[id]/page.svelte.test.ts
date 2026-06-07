/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { UserSkill } from '$lib/skills/authoring/types';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const skill: UserSkill = {
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA',
	description: 'd',
	version: '1.0.0',
	tags: ['nda'],
	body: 'Body text',
	slash_alias: '/nda',
	archived_at: null,
	created_at: '',
	updated_at: ''
} as UserSkill;

const props = (over: Record<string, unknown> = {}) =>
	({ data: { skill }, form: null, ...over }) as never;

describe('/skills/[id] page', () => {
	it('shows the breadcrumb and read-only slug', () => {
		render(Page, props());
		expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
		expect(screen.getByText('nda · v1.0.0')).toBeInTheDocument();
	});

	it('has a Save form posting ?/save seeded with the body', () => {
		render(Page, props());
		const form = screen.getByRole('form', { name: 'Edit skill' });
		expect(form).toHaveAttribute('action', '?/save');
		expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Body text');
	});

	it('shows a forked-from note when present', () => {
		render(Page, props({ data: { skill: { ...skill, forked_from: 'contract-review' } } }));
		expect(screen.getByText(/forked from/i)).toBeInTheDocument();
	});

	it('renders an inline slash_alias error from the form action', () => {
		render(
			Page,
			props({ form: { field: 'slash_alias', error: 'That slash command is already in use.' } })
		);
		expect(screen.getByText('That slash command is already in use.')).toBeInTheDocument();
	});

	it('opens an archive confirm dialog with a ?/archive form', async () => {
		render(Page, props());
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		const dialog = screen.getByRole('dialog', { name: 'Archive skill' });
		expect(dialog.querySelector('form[action="?/archive"]')).not.toBeNull();
	});
});
