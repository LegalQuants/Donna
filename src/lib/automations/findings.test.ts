// src/lib/automations/findings.test.ts
import { describe, it, expect } from 'vitest';
import {
	parseFindingList,
	parseRunMemories,
	severityKind,
	severitySummary,
	type FindingItem
} from './findings';

const finding = (over: Record<string, unknown> = {}) => ({
	id: 'f1',
	session_id: 's1',
	severity: 'info',
	title: 'Clause found',
	content: 'Body text',
	created_at: '2026-06-05T10:00:00Z',
	...over
});

describe('parseFindingList', () => {
	it('parses the findings envelope + total_count', () => {
		const out = parseFindingList({
			findings: [finding(), finding({ id: 'f2', severity: 'critical' })],
			total_count: 7,
			limit: 200,
			offset: 0
		});
		expect(out.findings).toHaveLength(2);
		expect(out.findings[0]).toEqual({
			id: 'f1',
			severity: 'info',
			title: 'Clause found',
			content: 'Body text',
			created_at: '2026-06-05T10:00:00Z'
		});
		expect(out.total).toBe(7);
	});
	it('drops malformed rows and tolerates missing fields', () => {
		const out = parseFindingList({
			findings: [
				{ bad: true },
				finding({ severity: null, title: null, content: null, created_at: null })
			],
			total_count: 2
		});
		expect(out.findings).toHaveLength(1);
		expect(out.findings[0]).toEqual({
			id: 'f1',
			severity: '',
			title: '',
			content: '',
			created_at: null
		});
	});
	it('falls back to the row count when total_count is absent', () => {
		expect(parseFindingList({ findings: [finding()] }).total).toBe(1);
		expect(parseFindingList(null)).toEqual({ findings: [], total: 0 });
	});
});

describe('parseRunMemories', () => {
	it('parses the entries envelope (NOT "memories") and returns total', () => {
		const out = parseRunMemories({
			entries: [
				{
					id: 'm1',
					state: 'proposed',
					category: 'preference',
					content: 'Likes brevity',
					created_at: '2026-06-05T10:01:00Z'
				}
			],
			total_count: 1
		});
		expect(out.total).toBe(1);
		expect(out.memories).toEqual([
			{
				id: 'm1',
				state: 'proposed',
				category: 'preference',
				content: 'Likes brevity',
				created_at: '2026-06-05T10:01:00Z'
			}
		]);
	});
	it('drops malformed rows; keeps unknown states verbatim', () => {
		const out = parseRunMemories({
			entries: [
				{ id: 'm1', state: 'weird', category: null, content: null, created_at: null },
				{ nope: 1 }
			]
		});
		expect(out.memories).toEqual([
			{ id: 'm1', state: 'weird', category: '', content: '', created_at: null }
		]);
	});
	it('returns { memories: [], total: 0 } for a non-object', () => {
		expect(parseRunMemories('x')).toEqual({ memories: [], total: 0 });
	});
	it('falls back total to 0 when total_count is absent', () => {
		const out = parseRunMemories({ entries: [] });
		expect(out.total).toBe(0);
	});
});

describe('severityKind', () => {
	it.each([
		['critical', 'critical'],
		['Critical', 'critical'],
		[' WARN ', 'warn'],
		['info', 'info'],
		['notice', 'other'],
		['', 'other']
	])('%s -> %s', (input, expected) => {
		expect(severityKind(input)).toBe(expected);
	});
});

describe('severitySummary', () => {
	const f = (severity: string): FindingItem => ({
		id: severity + Math.random(),
		severity,
		title: '',
		content: '',
		created_at: null
	});
	it('counts kinds in fixed order, skipping zero kinds', () => {
		expect(
			severitySummary([
				f('critical'),
				f('critical'),
				f('warn'),
				f('info'),
				f('info'),
				f('info'),
				f('info')
			])
		).toBe('2 critical · 1 warning · 4 info');
	});
	it('pluralizes warnings and includes other', () => {
		expect(severitySummary([f('warn'), f('warn'), f('notice')])).toBe('2 warnings · 1 other');
	});
	it('returns empty string for no findings', () => {
		expect(severitySummary([])).toBe('');
	});
});
