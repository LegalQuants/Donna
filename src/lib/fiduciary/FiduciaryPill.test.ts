import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FiduciaryPill from './FiduciaryPill.svelte';
import type { LedgerGate } from './ledger';

const gate: LedgerGate = {
	message_id: 'm',
	gate_status: 'flagged',
	pass_count: 1,
	supported_count: 0,
	fail_count: 1,
	total_assertions: 2,
	confidence: 1,
	created_at: null
};

describe('FiduciaryPill', () => {
	it('renders the verdict label as a button with aria-expanded', () => {
		render(FiduciaryPill, { gate, expanded: false, onclick: () => {} });
		const btn = screen.getByRole('button', { name: /needs review/i });
		expect(btn).toBeInTheDocument();
		expect(btn.getAttribute('aria-expanded')).toBe('false');
	});
	it('renders nothing when gate is null', () => {
		const { container } = render(FiduciaryPill, { gate: null, expanded: false, onclick: () => {} });
		expect(container.querySelector('button')).toBeNull();
	});
	it('fires onclick', async () => {
		const onclick = vi.fn();
		const { default: userEvent } = await import('@testing-library/user-event');
		render(FiduciaryPill, { gate, expanded: false, onclick });
		await userEvent.click(screen.getByRole('button', { name: /needs review/i }));
		expect(onclick).toHaveBeenCalled();
	});
});
