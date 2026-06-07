import type { Playbook } from './types';

export interface PlaybookFamily {
	family: string;
	playbooks: Playbook[];
}

/**
 * Group playbooks by contract family — the segment before the first '-' in
 * `contract_type` (NDA-unilateral → "NDA", MSA-SaaS → "MSA", DPA-GDPR → "DPA").
 * A dash-less `contract_type` is its own family. Families appear in first-seen
 * order; playbooks keep their input order within a family.
 */
export function groupByContractFamily(playbooks: Playbook[]): PlaybookFamily[] {
	const order: string[] = [];
	const byFamily = new Map<string, Playbook[]>();
	for (const pb of playbooks) {
		const family = pb.contract_type.split('-')[0];
		let bucket = byFamily.get(family);
		if (!bucket) {
			bucket = [];
			byFamily.set(family, bucket);
			order.push(family);
		}
		bucket.push(pb);
	}
	return order.map((family) => ({ family, playbooks: byFamily.get(family)! }));
}
