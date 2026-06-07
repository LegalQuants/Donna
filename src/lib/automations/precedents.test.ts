import { describe, it, expect } from 'vitest';
import { parsePrecedentList, parseProposalList } from './precedents';

const precedent = (over: Record<string, unknown> = {}) => ({
	id: 'p1',
	user_id: 'u1',
	pattern_kind: 'recurring-clause',
	summary: 'Vendor repeatedly accepts 30-day termination.',
	observed_count: 3,
	source_session_id: 's1',
	dismissed_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

const proposal = (over: Record<string, unknown> = {}) => ({
	id: 'pr1',
	user_id: 'u1',
	precedent_id: 'p1',
	project_id: 'proj1',
	suggested_md: '## Precedent\nVendor accepts 30-day termination.',
	state: 'proposed',
	accepted_at: null,
	rejected_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

describe('parsePrecedentList', () => {
	it('parses entries + total', () => {
		const out = parsePrecedentList({ entries: [precedent()], total_count: 5 });
		expect(out.total).toBe(5);
		expect(out.entries[0]).toMatchObject({
			id: 'p1',
			pattern_kind: 'recurring-clause',
			summary: 'Vendor repeatedly accepts 30-day termination.',
			observed_count: 3,
			source_session_id: 's1'
		});
	});

	it('drops malformed rows; defaults observed_count to 1 when non-numeric', () => {
		const out = parsePrecedentList({
			entries: [precedent(), { id: 1 }, precedent({ id: 'p2', observed_count: 'x' })],
			total_count: 3
		});
		expect(out.entries.map((p) => p.id)).toEqual(['p1', 'p2']);
		expect(out.entries[1].observed_count).toBe(1);
	});

	it('garbage → empty', () => {
		expect(parsePrecedentList(null)).toEqual({ entries: [], total: 0 });
	});
});

describe('parseProposalList', () => {
	it('parses the `proposals` key (not entries) + total', () => {
		const out = parseProposalList({ proposals: [proposal()], total_count: 2 });
		expect(out.total).toBe(2);
		expect(out.proposals[0]).toMatchObject({
			id: 'pr1',
			precedent_id: 'p1',
			project_id: 'proj1',
			state: 'proposed'
		});
		expect(out.proposals[0].suggested_md).toContain('30-day termination');
	});

	it('drops malformed rows, never throws; garbage → empty', () => {
		const out = parseProposalList({ proposals: [proposal(), { nope: 1 }], total_count: 2 });
		expect(out.proposals).toHaveLength(1);
		expect(parseProposalList(undefined)).toEqual({ proposals: [], total: 0 });
	});
});
