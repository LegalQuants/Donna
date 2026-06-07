import type { Position, PositionResult } from './types';

const SEVERITY_RANK: Record<Position['severity_if_missing'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};

/** Sort comparator: critical-first, then high, medium, low. Stable within a tier
 *  (Array.prototype.sort is stable in V8). */
export function compareBySeverity(a: PositionResult, b: PositionResult): number {
	return SEVERITY_RANK[a.severity_if_missing] - SEVERITY_RANK[b.severity_if_missing];
}
