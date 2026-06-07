/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SkillInputForm from './SkillInputForm.svelte';
import type { SkillInputDef } from './types';

const def = (over: Partial<SkillInputDef> & { name: string }): SkillInputDef =>
	({ type: 'text', required: false, ...over }) as SkillInputDef;

describe('SkillInputForm', () => {
	it('renders a text input for a required text def and flags it when empty', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [def({ name: 'party', type: 'text', required: true })],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		expect(screen.getByLabelText('party')).toBeInTheDocument();
		expect(screen.getByText(/required/i)).toBeInTheDocument();
	});

	it('renders a select for an enum def with its options', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [def({ name: 'jurisdiction', type: 'enum', required: true, enum: ['DE', 'NY'] })],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		const select = screen.getByLabelText('jurisdiction') as HTMLSelectElement;
		expect(select.tagName).toBe('SELECT');
		expect(screen.getByRole('option', { name: 'DE' })).toBeInTheDocument();
	});

	it('emits a number for an integer def on input', async () => {
		const onchange = vi.fn();
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [def({ name: 'count', type: 'integer', required: true })],
				optional: [],
				values: {},
				onchange
			}
		});
		await fireEvent.input(screen.getByLabelText('count'), { target: { value: '3' } });
		expect(onchange).toHaveBeenCalledWith('count', 3);
	});

	it('emits a boolean for a boolean def on toggle', async () => {
		const onchange = vi.fn();
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [],
				optional: [def({ name: 'redline', type: 'boolean', required: false })],
				values: {},
				onchange
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: /optional/i }));
		await fireEvent.click(screen.getByLabelText('redline'));
		expect(onchange).toHaveBeenCalledWith('redline', true);
	});

	it('hides optional inputs until the Optional group is expanded', async () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [],
				optional: [def({ name: 'notes', type: 'text' })],
				values: {},
				onchange: vi.fn()
			}
		});
		expect(screen.queryByLabelText('notes')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /optional \(1\)/i }));
		expect(screen.getByLabelText('notes')).toBeInTheDocument();
	});

	it('does not render a file-type input', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [def({ name: 'doc', type: 'file', required: true })],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		expect(screen.queryByLabelText('doc')).toBeNull();
	});

	it('pre-fills a text input from values', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [def({ name: 'party', type: 'text', required: true })],
				optional: [],
				values: { party: 'Acme' },
				onchange: vi.fn()
			}
		});
		expect((screen.getByLabelText('party') as HTMLInputElement).value).toBe('Acme');
	});
});
