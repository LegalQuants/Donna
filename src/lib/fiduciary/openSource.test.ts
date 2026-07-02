import { describe, it, expect, vi, afterEach } from 'vitest';
import { openLedgerSource } from './openSource';
import type { LedgerEntry } from './ledger';
import type { DocPanel } from '$lib/docpanel/docPanel.svelte';

function entry(source: LedgerEntry['source']): LedgerEntry {
	return {
		id: 'e',
		message_id: 'm',
		source_kind: source?.kind ?? 'unknown',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at: null,
		source
	};
}
function src(
	over: Partial<NonNullable<LedgerEntry['source']>>
): NonNullable<LedgerEntry['source']> {
	return {
		kind: 'kb_document',
		source_file_id: null,
		opinion_id: null,
		cluster_id: null,
		external_ref: null,
		provider: null,
		label: null,
		subtitle: null,
		url: null,
		tool: null,
		passages: [],
		...over
	};
}
function mockPanel() {
	return { open: vi.fn(), openOpinion: vi.fn() } as unknown as DocPanel;
}

afterEach(() => vi.restoreAllMocks());

describe('openLedgerSource', () => {
	it('opens a KB document by file id in the doc panel', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(src({ kind: 'kb_document', source_file_id: 'f1' })));
		expect(p.open).toHaveBeenCalledWith({ source_file_id: 'f1', verificationApplicable: false });
	});
	it('opens a caselaw opinion by opinion id', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(src({ kind: 'caselaw', opinion_id: 42, label: 'Roe v. Doe' })));
		expect(p.openOpinion).toHaveBeenCalledWith({ opinionId: 42, caseName: 'Roe v. Doe' });
	});
	it('opens an external url in a new tab', () => {
		const p = mockPanel();
		const openSpy = vi.fn();
		vi.stubGlobal('window', { open: openSpy });
		openLedgerSource(p, entry(src({ kind: 'authority', url: 'https://example.gov/x' })));
		expect(openSpy).toHaveBeenCalledWith('https://example.gov/x', '_blank', 'noopener');
	});
	it('does nothing for a null source', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(null));
		expect(p.open).not.toHaveBeenCalled();
		expect(p.openOpinion).not.toHaveBeenCalled();
	});
});
