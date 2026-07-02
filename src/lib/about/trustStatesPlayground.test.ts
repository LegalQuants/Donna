// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = (() => {
	try {
		return readFileSync('static/learn/playgrounds/trust-states.html', 'utf-8');
	} catch {
		return '';
	}
})();

describe('trust-states.html playground', () => {
	it('exists and is a self-contained single file (no external script/stylesheet)', () => {
		expect(html).not.toBe('');
		expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
		expect(html).not.toMatch(/<link[^>]+stylesheet/i);
	});
	it('names all four trust states', () => {
		for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
			expect(html).toContain(label);
	});
	it('carries the zero-assertion honesty rule and a Learn back-link', () => {
		expect(html.toLowerCase()).toContain('nothing to verify');
		expect(html).toContain('↩');
	});
	it('exposes the control labels the guide + e2e depend on', () => {
		expect(html).toContain('Backed in substance');
		expect(html).toContain('This answer made sourced claims');
		expect(html).toContain('id="pill-label"');
	});
});
