/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionDetail from './SessionDetail.svelte';
import type { SessionSummary } from './types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

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

	it('post-terminal: rerender with updated initial props reflects after poll done (receipt Keep/Dismiss)', async () => {
		// Mock fetch to return a terminal tick with a proposed memory in live state.
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							session: {
								id: 's1',
								status: 'completed',
								trigger_kind: 'manual',
								current_phase: 'delivery',
								cost_total_usd: '0.1',
								created_at: 'x'
							},
							receipt: null,
							findings: [],
							findings_total: 0,
							memories: [
								{
									id: 'm1',
									state: 'proposed',
									category: 'pref',
									content: 'Live proposed memory',
									created_at: 'x'
								}
							],
							memories_total: 1
						}),
						{ status: 200 }
					)
			)
		);

		const { rerender } = render(SessionDetail, {
			props: {
				initialSession: { ...session, status: 'running' },
				initialReceipt: null,
				initialFindings: [],
				initialFindingsTotal: 0,
				initialMemories: [
					{
						id: 'm1',
						state: 'proposed',
						category: 'pref',
						content: 'Live proposed memory',
						created_at: 'x'
					}
				],
				initialMemoriesTotal: 1
			}
		});

		// Advance past the first fetch so the poll fires and reaches terminal.
		await vi.advanceTimersByTimeAsync(100);

		// Poll is now done (terminal status). Simulate an invalidateAll after Keep:
		// rerender with updated initialMemories where the memory is now 'kept'.
		await rerender({
			initialSession: session,
			initialReceipt: null,
			initialFindings: [],
			initialFindingsTotal: 0,
			initialMemories: [
				{
					id: 'm1',
					state: 'kept',
					category: 'pref',
					content: 'Live proposed memory',
					created_at: 'x'
				}
			],
			initialMemoriesTotal: 1
		});

		// Post-terminal: the derived picks initialMemories (now with state='kept').
		// The 'kept' chip must appear, not 'proposed'.
		expect(screen.getByText('kept')).toBeInTheDocument();
		expect(screen.queryByText('proposed')).not.toBeInTheDocument();
	});

	it('SSR data stays visible when the first live tick arrives with null findings/memories', async () => {
		// Mock fetch to return a degraded first tick: session is valid but
		// findings/memories/totals are null (backend sub-requests degraded).
		// The real createSessionPoll is used so Svelte rune reactivity applies.
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							session: {
								id: 's1',
								status: 'running',
								trigger_kind: 'manual',
								current_phase: 'analysis',
								cost_total_usd: '0.1',
								created_at: 'x'
							},
							receipt: null,
							findings: null,
							findings_total: null,
							memories: null,
							memories_total: null
						}),
						{ status: 200 }
					)
			)
		);

		render(SessionDetail, {
			props: {
				initialSession: { ...session, status: 'running' },
				initialReceipt: null,
				initialFindings: [
					{ id: 'f1', severity: 'critical', title: 'SSR finding', content: 'C', created_at: 'x' }
				],
				initialFindingsTotal: 1,
				initialMemories: [
					{ id: 'm1', state: 'proposed', category: 'pref', content: 'SSR memory', created_at: 'x' }
				],
				initialMemoriesTotal: 1
			}
		});

		// SSR data visible before any tick.
		expect(screen.getByText('SSR finding')).toBeInTheDocument();
		expect(screen.getByText('SSR memory')).toBeInTheDocument();

		// Advance time so the poll's first tick fires and completes.
		await vi.advanceTimersByTimeAsync(100);

		// After the degraded tick, `live.session` is non-null but `live.findings` and
		// `live.memories` are null. The fixed deriveds fall back to initialFindings /
		// initialMemories; the unfixed ones would blank the section.
		expect(screen.getByText('SSR finding')).toBeInTheDocument();
		expect(screen.getByText('SSR memory')).toBeInTheDocument();
	});
});
