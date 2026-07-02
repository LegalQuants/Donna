// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SLUGS = [
	'authority-sources',
	'citation-ledger',
	'fiduciary-gate',
	'treatment-layer',
	'matter-session-flow'
];

describe('vendored fiduciary playgrounds', () => {
	for (const slug of SLUGS) {
		it(`${slug}.html is present and self-contained`, () => {
			const html = readFileSync(`static/learn/playgrounds/${slug}.html`, 'utf-8');
			expect(html.length).toBeGreaterThan(1000);
			expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
			expect(html).not.toMatch(/<link[^>]+stylesheet/i);
		});
	}
});
