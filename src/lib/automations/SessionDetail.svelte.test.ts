/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionDetail from './SessionDetail.svelte';
import type { SessionSummary } from './types';

const session: SessionSummary = {
	id: 's1',
	trigger_kind: 'manual',
	current_phase: 'delivery',
	status: 'completed',
	halt_state: 'running',
	cost_total_usd: 0.1,
	max_cost_usd: 2,
	cost_cap_reached: false,
	created_at: '2026-06-05T09:00:00Z',
	completed_at: '2026-06-05T09:04:00Z',
	last_activity_at: null,
	error: null
};

describe('SessionDetail', () => {
	it('renders Results (from initial props) between the header and the timeline', () => {
		render(SessionDetail, {
			props: {
				initialSession: session,
				initialReceipt: null,
				initialFindings: [
					{ id: 'f1', severity: 'critical', title: 'Indemnity gap', content: 'C', created_at: 'x' }
				],
				initialFindingsTotal: 1,
				initialMemories: [],
				initialMemoriesTotal: null
			}
		});
		expect(screen.getByText('Indemnity gap')).toBeInTheDocument();
		expect(screen.getByText('1 critical')).toBeInTheDocument();
		// Results section precedes the timeline in the DOM (a null receipt renders "Receipt unavailable")
		const results = screen.getByRole('region', { name: 'Results' });
		const timelineText = screen.getByText('Receipt unavailable');
		expect(
			results.compareDocumentPosition(timelineText) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		// Activity heading always renders inside the timeline section
		expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
	});
	it('terminal session with no findings shows the recorded-none state', () => {
		render(SessionDetail, {
			props: {
				initialSession: session,
				initialReceipt: null,
				initialFindings: [],
				initialFindingsTotal: 0,
				initialMemories: [],
				initialMemoriesTotal: null
			}
		});
		expect(screen.getByText('This run recorded no findings.')).toBeInTheDocument();
	});

	it('threads memoriesTotal overflow note through to RunResults', () => {
		render(SessionDetail, {
			props: {
				initialSession: session,
				initialReceipt: null,
				initialFindings: [],
				initialFindingsTotal: 0,
				initialMemories: [
					{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'x' }
				],
				initialMemoriesTotal: 10
			}
		});
		expect(screen.getByText(/\+9 more/)).toBeInTheDocument();
	});
});
