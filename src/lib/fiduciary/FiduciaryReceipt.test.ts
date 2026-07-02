import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FiduciaryReceipt from './FiduciaryReceipt.svelte';
import type { LedgerEntry, LedgerGate, LedgerTreatment } from './ledger';

const gate: LedgerGate = {
	message_id: 'm',
	gate_status: 'supported_only',
	pass_count: 1,
	supported_count: 0,
	fail_count: 0,
	total_assertions: 1,
	confidence: 0.95,
	created_at: null
};
function entry(p: Partial<LedgerEntry>): LedgerEntry {
	return {
		id: 'e',
		message_id: 'm',
		source_kind: 'kb_document',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at: null,
		source: {
			kind: 'kb_document',
			source_file_id: 'f',
			opinion_id: null,
			cluster_id: null,
			external_ref: null,
			provider: null,
			label: null,
			subtitle: null,
			url: null,
			tool: null,
			passages: [
				{
					text: 'governing law clause',
					offset_start: 0,
					offset_end: 20,
					page: null,
					verified: null,
					method: null
				}
			]
		},
		...p
	};
}

function treatment(p: Partial<LedgerTreatment>): LedgerTreatment {
	return {
		cited_by_count: null,
		as_of: null,
		derived_method: null,
		citing: [],
		strongest_negative_class: null,
		judged_count: null,
		judge_as_of: null,
		per_class_counts: {},
		case_confidence: null,
		signals: [],
		...p
	};
}

function caselawEntry(p: Partial<LedgerEntry>): LedgerEntry {
	return entry({
		source: {
			kind: 'caselaw',
			source_file_id: null,
			opinion_id: 42,
			cluster_id: null,
			external_ref: null,
			provider: null,
			label: 'Roe v. Wade',
			subtitle: null,
			url: null,
			tool: 'search_case_law',
			passages: [
				{
					text: 'a quoted holding',
					offset_start: 0,
					offset_end: 10,
					page: null,
					verified: null,
					method: null
				}
			]
		},
		...p
	});
}

describe('FiduciaryReceipt', () => {
	it('renders the gate summary and a quoted entry with its verification chip', () => {
		render(FiduciaryReceipt, { entries: [entry({})], gate });
		expect(screen.getByText(/1 assertion/i)).toBeInTheDocument();
		expect(screen.getByText(/governing law clause/i)).toBeInTheDocument();
		expect(screen.getByText(/verified/i)).toBeInTheDocument();
	});
	it('separates provenance ("consulted") rows into a lighter group', () => {
		const prov = entry({
			id: 'p',
			verification_status: 'provenance',
			source: {
				kind: 'caselaw',
				source_file_id: null,
				opinion_id: null,
				cluster_id: null,
				external_ref: null,
				provider: null,
				label: 'Miranda v. Arizona',
				subtitle: null,
				url: null,
				tool: 'search_case_law',
				passages: []
			}
		});
		render(FiduciaryReceipt, { entries: [entry({}), prov], gate });
		expect(screen.getByText(/consulted, not quoted/i)).toBeInTheDocument();
		expect(screen.getByText(/Miranda v. Arizona/)).toBeInTheDocument();
	});
	it('shows the honest zero-assertion state', () => {
		render(FiduciaryReceipt, {
			entries: [],
			gate: { ...gate, gate_status: 'fiduciary_grade', total_assertions: 0 }
		});
		expect(screen.getByText(/no sourced claims/i)).toBeInTheDocument();
	});
	it('shows derived treatment for a caselaw entry, with no good/bad color', () => {
		const e = caselawEntry({
			treatment: treatment({
				cited_by_count: 214,
				strongest_negative_class: 'overruled',
				signals: [
					{
						citing_opinion_id: 7,
						classification: 'overruled',
						confidence: 0.9,
						justification: 'Later court expressly overruled the holding.'
					}
				]
			})
		});
		render(FiduciaryReceipt, { entries: [e], gate });
		expect(screen.getByText(/cited by 214/i)).toBeInTheDocument();
		expect(screen.getByText(/derived/i)).toBeInTheDocument();
		expect(screen.getByText(/strongest signal: overruled/i)).toBeInTheDocument();
		expect(screen.getByText(/later court expressly overruled the holding/i)).toBeInTheDocument();
		const treatmentLine = screen.getByText(/cited by 214/i);
		expect(treatmentLine.className).not.toMatch(/text-mlq-verified/);
		expect(treatmentLine.className).not.toMatch(/text-mlq-error/);
		expect(treatmentLine.className).toMatch(/text-mlq-muted/);
	});
	it('shows a checking-treatment state for a caselaw entry with treatment: null', () => {
		const e = caselawEntry({ treatment: null });
		render(FiduciaryReceipt, { entries: [e], gate });
		expect(screen.getByText(/checking treatment/i)).toBeInTheDocument();
	});
	it('makes the quoted source title a button that calls onopensource when provided', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const onopensource = vi.fn();
		const e = entry({});
		render(FiduciaryReceipt, { entries: [e], gate, onopensource });
		const button = screen.getByRole('button', { name: /knowledge-base document/i });
		await userEvent.click(button);
		expect(onopensource).toHaveBeenCalledWith(e);
	});
	it('renders the quoted source title as plain text when onopensource is absent', () => {
		render(FiduciaryReceipt, { entries: [entry({})], gate });
		expect(
			screen.queryByRole('button', { name: /knowledge-base document/i })
		).not.toBeInTheDocument();
		expect(screen.getByText(/knowledge-base document/i)).toBeInTheDocument();
	});
});
