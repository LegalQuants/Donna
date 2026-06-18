import { describe, it, expect } from 'vitest';
import {
	parseCapabilities,
	parseSearchResponse,
	parseClusterView,
	parseFindMatches,
	parseCitations,
	textFieldLabel
} from './research';

describe('parseCapabilities', () => {
	it('reads enabled + providers', () => {
		expect(
			parseCapabilities({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] })
		).toEqual({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] });
	});
	it('defaults to disabled on junk', () => {
		expect(parseCapabilities(null)).toEqual({ enabled: false, providers: [] });
		expect(parseCapabilities({ enabled: 'yes' })).toEqual({ enabled: false, providers: [] });
	});
});

describe('parseSearchResponse', () => {
	it('keeps well-formed rows, drops malformed, carries count + cursor', () => {
		const out = parseSearchResponse({
			count: 2,
			next_cursor: 'abc',
			results: [{ cluster_id: 1, case_name: 'A v. B' }, 42, { case_name: 'no id ok' }]
		});
		expect(out.count).toBe(2);
		expect(out.nextCursor).toBe('abc');
		expect(out.results).toHaveLength(2);
		expect(out.results[0]).toMatchObject({ cluster_id: 1, case_name: 'A v. B' });
	});
	it('empty on junk', () => {
		expect(parseSearchResponse(null)).toEqual({ count: null, nextCursor: null, results: [] });
	});
});

describe('parseClusterView', () => {
	it('parses cluster + opinion list', () => {
		const out = parseClusterView({
			cluster: { cluster_id: 5, case_name: 'X', court: 'scotus' },
			opinions: [{ opinion_id: 9, text_field_used: 'plain_text', char_length: 10 }, { bad: true }]
		});
		expect(out?.cluster.cluster_id).toBe(5);
		expect(out?.opinions).toHaveLength(1);
		expect(out?.opinions[0]).toMatchObject({ opinion_id: 9, text_field_used: 'plain_text' });
	});
	it('null when cluster_id missing', () => {
		expect(parseClusterView({ cluster: {}, opinions: [] })).toBeNull();
	});
});

describe('parseFindMatches', () => {
	it('keeps numeric-position rows only', () => {
		const out = parseFindMatches({ matches: [{ position: 3, snippet: 'hi' }, { snippet: 'x' }] });
		expect(out).toEqual([{ position: 3, snippet: 'hi' }]);
	});
});

describe('parseCitations', () => {
	it('parses verified citations + nested clusters', () => {
		const out = parseCitations({
			citations: [
				{
					citation: '576 U.S. 644',
					normalized_citations: ['576 U.S. 644'],
					status: 200,
					clusters: [{ id: 1, case_name: 'Obergefell', absolute_url: '/o/1/' }]
				},
				'junk'
			]
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ citation: '576 U.S. 644', status: 200 });
		expect(out[0].clusters[0]).toMatchObject({ id: 1, case_name: 'Obergefell' });
	});
});

describe('textFieldLabel', () => {
	it('maps the enum to honest labels', () => {
		expect(textFieldLabel('plain_text')).toBe('Plain text');
		expect(textFieldLabel('html_with_citations')).toBe('HTML-derived');
		expect(textFieldLabel('xml_harvard')).toBe('XML-derived (Harvard)');
		expect(textFieldLabel(null)).toBe('');
		expect(textFieldLabel('weird')).toBe('');
	});
});
