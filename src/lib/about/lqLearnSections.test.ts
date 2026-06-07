import { describe, it, expect } from 'vitest';
import { lqLearnSections } from './lqLearnSections';

const PLAYGROUNDS = [
	'system-architecture',
	'request-lifecycle',
	'tier-system',
	'skill-composition',
	'citation-engine-cascade',
	'anonymization-layer',
	'data-residency',
	'playbook-cascade',
	'tabular-review',
	'word-addin-flow',
	'otel-eval',
	'autonomous-flow',
	'autonomous-primitives',
	'kb-hybrid-retrieval',
	'projects-org-tiers',
	'intake-bridges'
];

describe('lqLearnSections', () => {
	it('has the 16 How-It-Works sections in order with the expected playgrounds', () => {
		expect(lqLearnSections).toHaveLength(16);
		expect(lqLearnSections.map((s) => s.playground)).toEqual(PLAYGROUNDS);
		lqLearnSections.forEach((s, i) => {
			expect(s.number).toBe(i + 1);
			expect(s.title.length).toBeGreaterThan(0);
			expect(s.paragraphs.length).toBeGreaterThan(0);
			expect(s.paragraphs.every((p) => p.trim().length > 0)).toBe(true);
			expect(s.sourceUrl).toMatch(/^https:\/\/github\.com\/LegalQuants\/lq-ai/);
			expect(s.sourceLabel.length).toBeGreaterThan(0);
		});
	});

	it('does not leak the "LQ.AI" dotted spelling (normalized to LQ-AI)', () => {
		for (const s of lqLearnSections) {
			for (const p of s.paragraphs) expect(p).not.toMatch(/LQ\.AI/);
		}
	});
});
