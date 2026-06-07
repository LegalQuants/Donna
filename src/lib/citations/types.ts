import type { components } from '$lib/api/backend';

export type VerificationMethod =
	| 'exact_match'
	| 'tolerant_match'
	| 'paraphrase_judge'
	| 'ensemble_strict'
	| 'ensemble_majority';

/** The live M2-A2 citations endpoint returns more than the generated schema documents. */
export type Citation = components['schemas']['Citation'] & {
	verification_method?: VerificationMethod | (string & {});
	verification_confidence?: number | null;
	/** Doc-panel hint: when false, suppress the verification chip (e.g. a non-ensemble tabular citation, which carries confidence, not verification). Undefined ⇒ chip shown (chat default). */
	verificationApplicable?: boolean;
};

export type CiteState = 'verified' | 'caveats' | 'unverified';

const GREEN = new Set(['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']);

/** Derive the UI state. Method drives green-vs-yellow (per citation-engine doc). */
export function citeState(c: Citation | undefined): CiteState {
	if (!c || c.verified !== true) return 'unverified';
	if (c.partial) return 'caveats';
	if (c.verification_method) return GREEN.has(c.verification_method) ? 'verified' : 'caveats';
	return 'verified'; // verified && !partial && method unknown
}

export function tooltipFor(c: Citation | undefined): string {
	if (!c || c.verified !== true) return 'Unverified — could not confirm against the source';
	const conf =
		typeof c.verification_confidence === 'number'
			? ` (${Math.round(c.verification_confidence * 100)}%)`
			: '';
	const partial = c.partial ? ' (source partially supports)' : '';
	switch (c.verification_method) {
		case 'exact_match':
			return `Verified — exact match in source${conf}`;
		case 'tolerant_match':
			return `Verified — matches source (normalized)${conf}`;
		case 'paraphrase_judge':
			return `Verified by judge — source supports this claim${conf}${partial}`;
		case 'ensemble_strict':
			return `Verified by ensemble — all judges agreed${conf}${partial}`;
		case 'ensemble_majority':
			return `Verified by ensemble — majority of judges agreed${conf}${partial}`;
		default:
			return `Verified${conf}${partial}`;
	}
}
