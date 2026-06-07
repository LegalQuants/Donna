import { describe, it, expect } from 'vitest';
import { parseMemoryList, MEMORY_STATES, type MemoryEntry } from './memory';

const entry = (over: Record<string, unknown> = {}) => ({
	id: 'm1',
	user_id: 'u1',
	state: 'proposed',
	category: 'workflow',
	content: 'Prefers concise summaries.',
	source_session_id: 's1',
	kept_at: null,
	deleted_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

describe('parseMemoryList', () => {
	it('parses a well-formed list with total', () => {
		const out = parseMemoryList({ entries: [entry()], total_count: 7, limit: 50, offset: 0 });
		expect(out.total).toBe(7);
		expect(out.entries).toHaveLength(1);
		const m = out.entries[0] as MemoryEntry;
		expect(m).toMatchObject({
			id: 'm1',
			state: 'proposed',
			category: 'workflow',
			content: 'Prefers concise summaries.',
			source_session_id: 's1'
		});
		expect(m.created_at).toBe('2026-06-07T09:00:00Z');
	});

	it('drops malformed rows, never throws', () => {
		const out = parseMemoryList({
			entries: [entry(), { id: 42 }, 'junk', entry({ id: 'm2', content: 7 })],
			total_count: 4
		});
		expect(out.entries.map((m) => m.id)).toEqual(['m1']);
	});

	it('unknown state strings survive (free-text-safe rendering downstream)', () => {
		const out = parseMemoryList({ entries: [entry({ state: 'weird' })], total_count: 1 });
		expect(out.entries[0].state).toBe('weird');
	});

	it('garbage input → empty result', () => {
		expect(parseMemoryList(null)).toEqual({ entries: [], total: 0 });
		expect(parseMemoryList({ entries: 'no' })).toEqual({ entries: [], total: 0 });
	});

	it('exports the canonical state filter list', () => {
		expect(MEMORY_STATES).toEqual(['proposed', 'kept', 'dismissed']);
	});
});
