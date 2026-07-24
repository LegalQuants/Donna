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

	it('renders the input name as a title-cased label with a required marker and the description as help text', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [
					def({
						name: 'perspective',
						type: 'text',
						required: true,
						description: 'The vantage point to review from'
					})
				],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		expect(screen.getByText('Perspective')).toBeInTheDocument();
		expect(screen.getByText('*')).toBeInTheDocument();
		expect(screen.getByText('The vantage point to review from')).toBeInTheDocument();
		// The raw name still drives the control's accessible name.
		expect(screen.getByLabelText('perspective')).toBeInTheDocument();
	});

	it('does not render a required marker for optional inputs', async () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [],
				optional: [def({ name: 'extra_notes', type: 'text' })],
				values: {},
				onchange: vi.fn()
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: /optional \(1\)/i }));
		expect(screen.getByText('Extra Notes')).toBeInTheDocument();
		expect(screen.queryByText('*')).toBeNull();
	});

	it('renders a select with parsed options for a pipe-enum description', async () => {
		const onchange = vi.fn();
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [
					def({
						name: 'depth',
						type: 'text',
						required: true,
						description: 'quick | standard | deep. How thorough the review should be.'
					})
				],
				optional: [],
				values: {},
				onchange
			}
		});
		const select = screen.getByLabelText('depth') as HTMLSelectElement;
		expect(select.tagName).toBe('SELECT');
		expect(screen.getByRole('option', { name: 'quick' })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: 'standard' })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: 'deep' })).toBeInTheDocument();
		// An empty choice exists so the value can be left unset.
		expect((select.options[0] as HTMLOptionElement).value).toBe('');
		// The option list is not repeated in the help text; the remainder is.
		expect(screen.getByText('How thorough the review should be.')).toBeInTheDocument();
		expect(screen.queryByText(/quick \| standard \| deep/)).toBeNull();
		await fireEvent.change(select, { target: { value: 'deep' } });
		expect(onchange).toHaveBeenCalledWith('depth', 'deep');
	});

	it('keeps a free-text input when the description has no pipe-enum head', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [
					def({
						name: 'focus',
						type: 'text',
						required: true,
						description: 'What to focus on. E.g. liability or IP.'
					})
				],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		expect((screen.getByLabelText('focus') as HTMLInputElement).tagName).toBe('INPUT');
	});

	it('renders an attach hint instead of a text box for a document input', () => {
		render(SkillInputForm, {
			props: {
				skillTitle: 'NDA',
				required: [
					def({
						name: 'contract',
						type: 'document',
						required: true,
						description: 'The contract to review'
					})
				],
				optional: [],
				values: {},
				onchange: vi.fn()
			}
		});
		expect(screen.getByText('Contract')).toBeInTheDocument();
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.getByTestId('doc-hint-contract')).toHaveTextContent(
			'Attach the document to the message — the clip button'
		);
		// Not fillable inline, so it must not warn as missing.
		expect(screen.queryByText(/⚠ required/)).toBeNull();
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
