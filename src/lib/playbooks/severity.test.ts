import { describe, it, expect } from 'vitest';
import { compareBySeverity } from './severity';
import type { PositionResult } from './types';

const pos = (severity: PositionResult['severity_if_missing'], id: string): PositionResult => ({
	issue: id,
	position_id: id,
	severity_if_missing: severity,
	verdict: 'deviates',
	confidence: 1,
	matched_text: null,
	matched_fallback_rank: null,
	justification: '',
	redline: null,
	cited_chunk_ids: []
});

describe('compareBySeverity', () => {
	it('orders critical → high → medium → low', () => {
		const sorted = [
			pos('low', 'a'),
			pos('critical', 'b'),
			pos('medium', 'c'),
			pos('high', 'd')
		].sort(compareBySeverity);
		expect(sorted.map((p) => p.severity_if_missing)).toEqual(['critical', 'high', 'medium', 'low']);
	});

	it('is stable within a severity tier (preserves input order)', () => {
		const sorted = [pos('high', 'x'), pos('high', 'y'), pos('high', 'z')].sort(compareBySeverity);
		expect(sorted.map((p) => p.position_id)).toEqual(['x', 'y', 'z']);
	});
});
