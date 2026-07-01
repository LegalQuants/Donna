import { describe, it, expect } from 'vitest';
import { parseSources, sourceTitle } from './sources';

describe('parseSources', () => {
	it('parses a configured and an unconfigured source (integration doc §2.4)', () => {
		const raw = {
			sources: [
				{
					name: null,
					type: 'courtlistener',
					jurisdiction: 'us-federal',
					coverage: 'U.S. federal & state appellate caselaw (operator CourtListener key)',
					content_kinds: ['caselaw'],
					enabled: false,
					egress_tier: null
				},
				{
					name: 'govinfo-prod',
					type: 'govinfo',
					jurisdiction: 'us-federal',
					coverage: 'U.S. Code + Code of Federal Regulations',
					content_kinds: ['statute', 'regulation'],
					enabled: true,
					egress_tier: 2
				}
			]
		};
		const out = parseSources(raw);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({
			name: null,
			type: 'courtlistener',
			jurisdiction: 'us-federal',
			coverage: 'U.S. federal & state appellate caselaw (operator CourtListener key)',
			content_kinds: ['caselaw'],
			enabled: false,
			egress_tier: null
		});
		expect(out[1].enabled).toBe(true);
		expect(out[1].egress_tier).toBe(2);
	});

	it('drops rows missing the required type field, keeps valid ones', () => {
		const raw = { sources: [{ name: 'x' }, { type: 'govinfo' }] };
		const out = parseSources(raw);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('govinfo');
		expect(out[0].content_kinds).toEqual([]);
	});

	it('returns [] for a malformed envelope without throwing', () => {
		expect(parseSources(null)).toEqual([]);
		expect(parseSources({})).toEqual([]);
		expect(parseSources({ sources: 'nope' })).toEqual([]);
	});

	it('filters non-string content_kinds', () => {
		const out = parseSources({ sources: [{ type: 'x', content_kinds: ['statute', 3, null] }] });
		expect(out[0].content_kinds).toEqual(['statute']);
	});
});

describe('sourceTitle', () => {
	it('prefers name, falls back to type', () => {
		expect(sourceTitle({ name: 'govinfo-prod', type: 'govinfo' } as never)).toBe('govinfo-prod');
		expect(sourceTitle({ name: null, type: 'courtlistener' } as never)).toBe('courtlistener');
	});
});
