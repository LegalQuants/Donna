import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FiduciaryReceipt from './FiduciaryReceipt.svelte';
import type { LedgerEntry, LedgerGate } from './ledger';

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
});
