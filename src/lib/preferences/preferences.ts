import type { ChatModelOption } from '$lib/models/types';

export type TrustFormat = 'labels' | 'dots';
export type ProvenanceMode = 'always' | 'collapsed';

export interface TrustPosture {
	tone: 'local' | 'cloud';
	/** Short pill text, e.g. "Self-hosted · Local" or "Cloud · Tier 4". */
	label: string;
	/** Longer hover/title explanation. */
	detail: string;
}

/** Derive the ambient trust pill content from the selected model option. */
export function trustPosture(option: ChatModelOption): TrustPosture {
	if (option.group === 'local') {
		return {
			tone: 'local',
			label: 'Self-hosted · Local',
			detail:
				'Inference runs on a self-hosted local model — your prompt never leaves your environment.'
		};
	}
	const tierSuffix = option.tier != null ? ` · Tier ${option.tier}` : '';
	const modelName = option.label || option.resolvedModel || 'a cloud model';
	return {
		tone: 'cloud',
		label: `Cloud${tierSuffix}`,
		detail: `Cloud inference via ${modelName}${option.tier != null ? ` at Tier ${option.tier}` : ''}. Outbound requests pass through the anonymization layer.`
	};
}

export const TRUST_OPTIONS: { value: TrustFormat; label: string }[] = [
	{ value: 'labels', label: 'Labels' },
	{ value: 'dots', label: 'Dots' }
];

export const PROVENANCE_OPTIONS: { value: ProvenanceMode; label: string }[] = [
	{ value: 'always', label: 'Always shown' },
	{ value: 'collapsed', label: 'Collapsed' }
];
