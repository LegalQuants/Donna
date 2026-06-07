// src/lib/automations/RunNowForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import RunNowForm from './RunNowForm.svelte';
import type { SourceItem } from './runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { MatterSummary } from '$lib/matters/types';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [
	{ value: 'comms-improver', label: 'Comms Improver', sub: 'builtin' }
];
const kbs: KnowledgeBase[] = [
	{
		id: 'kb1',
		name: 'Contracts KB',
		owner_id: 'u1',
		hybrid_alpha: 0.5,
		file_count: 0,
		chunk_count: 0,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z'
	}
];
const matters: MatterSummary[] = [{ id: 'm1', name: 'Acme' }];

function setup() {
	return render(RunNowForm, { props: { playbookItems, skillItems, kbs, matters } });
}

// KbPicker renders a "Choose a knowledge base" trigger button (triggerLabel passed
// from RunNowForm); KB items are only visible after opening that dropdown.
// Helper opens the picker, then clicks the named KB row (a plain <button> rendered
// by KbPicker's list).
async function pickKb(name: RegExp | string) {
	await fireEvent.click(screen.getByRole('button', { name: /choose a knowledge base/i }));
	await fireEvent.click(screen.getByRole('button', { name }));
}

describe('RunNowForm', () => {
	it('disables Run until a source and a KB are chosen', async () => {
		setup();
		const run = screen.getByRole('button', { name: /^run$/i });
		expect(run).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		expect(run).toBeDisabled(); // still needs a KB
		await pickKb(/Contracts KB/);
		expect(run).not.toBeDisabled();
	});
	it('submits playbook_id + target_kb_id via hidden inputs', async () => {
		const { container } = setup();
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		await pickKb(/Contracts KB/);
		expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe(
			'p1'
		);
		expect((container.querySelector('input[name="target_kb_id"]') as HTMLInputElement).value).toBe(
			'kb1'
		);
		expect(container.querySelector('input[name="skill_ref"]')).toBeNull();
	});
	it('switching to Skill mode emits skill_ref instead of playbook_id', async () => {
		const { container } = setup();
		await fireEvent.click(screen.getByRole('radio', { name: /skill/i }));
		await fireEvent.click(screen.getByRole('button', { name: /Comms Improver/ }));
		await pickKb(/Contracts KB/);
		expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe(
			'comms-improver'
		);
		expect(container.querySelector('input[name="playbook_id"]')).toBeNull();
	});
	it('puts a typed cost cap into the hidden max_cost_usd input (string, no number coercion)', async () => {
		const { container } = setup();
		await fireEvent.input(screen.getByLabelText(/cost cap/i), { target: { value: '2.50' } });
		expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe(
			'2.50'
		);
	});
});
