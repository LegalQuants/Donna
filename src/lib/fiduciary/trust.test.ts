import { describe, it, expect } from 'vitest';
import { gateVerdict, entryVerification, isProvenance } from './trust';
import type { LedgerGate } from './ledger';

function gate(p: Partial<LedgerGate>): LedgerGate {
	return {
		message_id: 'm',
		gate_status: 'fiduciary_grade',
		pass_count: 0,
		supported_count: 0,
		fail_count: 0,
		total_assertions: 0,
		confidence: null,
		created_at: null,
		...p
	};
}

describe('gateVerdict', () => {
	it('fiduciary_grade with assertions → green grade', () => {
		const v = gateVerdict(
			gate({ gate_status: 'fiduciary_grade', total_assertions: 3, pass_count: 3 })
		)!;
		expect(v.tone).toBe('grade');
		expect(v.label).toBe('Fiduciary-grade');
		expect(v.pillClass).toContain('mlq-verified');
	});
	it('fiduciary_grade with ZERO assertions → neutral, never green', () => {
		const v = gateVerdict(gate({ gate_status: 'fiduciary_grade', total_assertions: 0 }))!;
		expect(v.tone).toBe('none');
		expect(v.label).toBe('No sourced claims');
		expect(v.pillClass).toContain('mlq-muted');
		expect(v.pillClass).not.toContain('mlq-verified');
	});
	it('supported_only → amber', () => {
		const v = gateVerdict(
			gate({ gate_status: 'supported_only', total_assertions: 2, supported_count: 2 })
		)!;
		expect(v.tone).toBe('supported');
		expect(v.label).toBe('Supported');
		expect(v.pillClass).toContain('mlq-caveats');
	});
	it('flagged → red "Needs review"', () => {
		const v = gateVerdict(gate({ gate_status: 'flagged', total_assertions: 2, fail_count: 1 }))!;
		expect(v.tone).toBe('review');
		expect(v.label).toBe('Needs review');
		expect(v.pillClass).toContain('mlq-unverified');
	});
	it('null gate → null (no pill)', () => {
		expect(gateVerdict(null)).toBeNull();
	});
	it('unknown gate_status → treated as review (fail-safe)', () => {
		expect(gateVerdict(gate({ gate_status: 'weird', total_assertions: 1 }))!.tone).toBe('review');
	});
});

describe('entryVerification', () => {
	it('exact/tolerant/ensemble → verified green', () => {
		for (const s of ['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']) {
			expect(entryVerification(s).state).toBe('verified');
		}
	});
	it('paraphrase/llm judge → caveats amber', () => {
		expect(entryVerification('paraphrase_judge').state).toBe('caveats');
		expect(entryVerification('llm_judge').state).toBe('caveats');
	});
	it('unverified/failed → unverified red', () => {
		expect(entryVerification('unverified').state).toBe('unverified');
		expect(entryVerification('failed').state).toBe('unverified');
	});
	it('provenance → provenance', () => {
		expect(entryVerification('provenance').state).toBe('provenance');
		expect(isProvenance('provenance')).toBe(true);
		expect(isProvenance('exact_match')).toBe(false);
	});
});
