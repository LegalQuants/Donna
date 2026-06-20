import { describe, it, expect } from 'vitest';
import { parseToolSources } from './sources';

describe('parseToolSources', () => {
	it('parses well-formed rows and preserves order', () => {
		const out = parseToolSources([
			{
				id: 's1',
				message_id: 'm1',
				source_kind: 'caselaw',
				label: 'Roe v. Wade, 410 U.S. 113 (1973)',
				subtitle: 'U.S. Supreme Court · 1973',
				url: 'https://www.courtlistener.com/opinion/108713/roe-v-wade/',
				external_ref: '108713',
				provider: 'courtlistener',
				tool: 'search_case_law',
				created_at: '2026-06-20T00:00:00Z'
			},
			{ label: 'Second case', provider: 'courtlistener', tool: 'get_cluster' }
		]);
		expect(out).toHaveLength(2);
		expect(out[0].label).toBe('Roe v. Wade, 410 U.S. 113 (1973)');
		expect(out[0].subtitle).toBe('U.S. Supreme Court · 1973');
		expect(out[1].label).toBe('Second case');
		expect(out[1].subtitle).toBeNull();
		expect(out[1].url).toBeNull();
	});

	it('drops rows missing the load-bearing label', () => {
		const out = parseToolSources([
			{ id: 'x', provider: 'courtlistener', tool: 'search_case_law' },
			{ label: 'Keep me' }
		]);
		expect(out).toHaveLength(1);
		expect(out[0].label).toBe('Keep me');
	});

	it('returns [] for non-array / malformed input', () => {
		expect(parseToolSources(null)).toEqual([]);
		expect(parseToolSources({ nope: true })).toEqual([]);
		expect(parseToolSources([null, 3, 'x'])).toEqual([]);
	});
});
