// src/lib/fiduciary/trust.ts
// The single owner of the fiduciary trust vocabulary: the per-turn gate verdict
// (4 states, incl. the total_assertions===0 → neutral honesty rule) and the
// per-entry verification chip. Colors use the citation-domain mlq tokens so the
// pill stays consistent with inline citations. Switch on gate_status (there is no
// `verdict` field).
import type { LedgerGate } from './ledger';

export type TrustTone = 'grade' | 'supported' | 'review' | 'none';
export interface GateVerdict {
	tone: TrustTone;
	label: string;
	explanation: string;
	pillClass: string;
	dotClass: string;
}

export function gateVerdict(gate: LedgerGate | null): GateVerdict | null {
	if (!gate) return null;
	// Honesty rule: fiduciary_grade with zero assertions means "nothing to verify",
	// NOT "verified" — render neutral, never green.
	if (gate.gate_status === 'fiduciary_grade' && gate.total_assertions === 0) {
		return {
			tone: 'none',
			label: 'No sourced claims',
			explanation: 'This answer did not quote or rely on a specific source.',
			pillClass: 'border-mlq-subtle bg-mlq-surface-alt text-mlq-muted',
			dotClass: 'bg-mlq-muted'
		};
	}
	if (gate.gate_status === 'fiduciary_grade') {
		return {
			tone: 'grade',
			label: 'Fiduciary-grade',
			explanation: 'Every quoted claim was matched against its original source.',
			pillClass: 'border-mlq-verified/40 bg-mlq-verified/10 text-mlq-verified',
			dotClass: 'bg-mlq-verified'
		};
	}
	if (gate.gate_status === 'supported_only') {
		return {
			tone: 'supported',
			label: 'Supported',
			explanation: 'Claims are backed by the sources in substance, verified by meaning.',
			pillClass: 'border-mlq-caveats/40 bg-mlq-caveats/15 text-mlq-caveats',
			dotClass: 'bg-mlq-caveats'
		};
	}
	// flagged, or any unknown status → fail-safe to the cautious "needs review".
	return {
		tone: 'review',
		label: 'Needs review',
		explanation: 'At least one quoted claim could not be confirmed in its source.',
		pillClass: 'border-mlq-unverified/40 bg-mlq-unverified/10 text-mlq-unverified',
		dotClass: 'bg-mlq-unverified'
	};
}

export type EntryState = 'verified' | 'caveats' | 'unverified' | 'provenance';
export interface EntryChip {
	state: EntryState;
	label: string;
	cls: string;
}

const GREEN = new Set(['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']);
const AMBER = new Set(['paraphrase_judge', 'llm_judge']);

export function isProvenance(status: string): boolean {
	return status === 'provenance';
}

export function entryVerification(status: string): EntryChip {
	if (status === 'provenance') {
		return { state: 'provenance', label: 'consulted', cls: 'bg-mlq-surface-alt text-mlq-muted' };
	}
	if (GREEN.has(status)) {
		return { state: 'verified', label: 'verified', cls: 'bg-mlq-verified/15 text-mlq-verified' };
	}
	if (AMBER.has(status)) {
		return { state: 'caveats', label: 'supported', cls: 'bg-mlq-caveats/20 text-mlq-caveats' };
	}
	return {
		state: 'unverified',
		label: 'unverified',
		cls: 'bg-mlq-unverified/15 text-mlq-unverified'
	};
}
