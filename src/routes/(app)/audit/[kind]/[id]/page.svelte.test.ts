/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { Ledger } from '$lib/fiduciary/ledger';

function chatLedger(): Ledger {
	return {
		entries: [
			{
				id: 'e1',
				message_id: 'm1',
				source_kind: 'caselaw',
				verification_status: 'exact_match',
				confidence: 1,
				provider: 'courtlistener',
				retrieved_at: null,
				treatment_id: null,
				treatment: null,
				created_at: '2026-07-03T10:00:00Z',
				source: {
					kind: 'caselaw',
					source_file_id: null,
					opinion_id: 111,
					cluster_id: null,
					external_ref: null,
					provider: 'courtlistener',
					label: 'Edwards v. Arthur Andersen',
					subtitle: null,
					url: null,
					tool: null,
					passages: [
						{
							text: 'noncompetes are void',
							offset_start: null,
							offset_end: null,
							page: null,
							verified: true,
							method: 'exact_match'
						}
					]
				}
			}
		],
		gates: [
			{
				message_id: 'm1',
				gate_status: 'fiduciary_grade',
				pass_count: 1,
				supported_count: 0,
				fail_count: 0,
				total_assertions: 1,
				confidence: 1,
				created_at: null
			}
		]
	};
}

describe('/audit/[kind]/[id] page', () => {
	it('renders the honest header and a gate pill + receipt for a chat', () => {
		render(Page, {
			props: { data: { kind: 'chat', id: 'c1', role: 'auditor', ledger: chatLedger() } } as never
		});
		expect(screen.getByRole('heading', { name: /compliance review/i })).toBeInTheDocument();
		expect(screen.getByText(/recorded in the audit log/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /fiduciary-grade/i })).toBeInTheDocument();
		expect(screen.getByText(/Edwards v\. Arthur Andersen/i)).toBeInTheDocument();
	});

	it('renders an honest empty state for an empty ledger', () => {
		render(Page, {
			props: {
				data: { kind: 'session', id: 's1', role: 'admin', ledger: { entries: [], gates: [] } }
			} as never
		});
		expect(screen.getByText(/no ledger entries/i)).toBeInTheDocument();
	});
});
