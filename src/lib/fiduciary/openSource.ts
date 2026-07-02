// src/lib/fiduciary/openSource.ts
// Shared click-through for a ledger entry's source, reused by the chat receipt
// (chats/[id]/+page.svelte) and the autonomous-session receipt
// (automations/[id]/+page.svelte). KB document → doc panel at the file; caselaw
// → opinion viewer; anything with an external url → a new tab. No statute viewer
// in the doc panel yet, so authority/statute falls through to the url.
import type { LedgerEntry } from './ledger';
import type { Citation } from '$lib/citations/types';
import type { DocPanel } from '$lib/docpanel/docPanel.svelte';

export function openLedgerSource(docPanel: DocPanel, entry: LedgerEntry): void {
	const s = entry.source;
	if (!s) return;
	if (s.source_file_id) {
		docPanel.open({
			source_file_id: s.source_file_id,
			verificationApplicable: false
		} as Citation);
	} else if (s.opinion_id) {
		docPanel.openOpinion({
			opinionId: s.opinion_id,
			caseName: s.label ?? `Opinion #${s.opinion_id}`
		});
	} else if (s.url) {
		window.open(s.url, '_blank', 'noopener');
	}
}
