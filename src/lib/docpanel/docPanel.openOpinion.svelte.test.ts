import { describe, it, expect } from 'vitest';
import { createDocPanel } from './docPanel.svelte';

describe('docPanel.openOpinion', () => {
	it('opens a text/plain opinion tab keyed by opinion id, with the /text content url', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 42, caseName: 'Chevron v. NRDC' });
		expect(dp.open_).toBe(true);
		expect(dp.activeId).toBe('opinion:42');
		const tab = dp.activeTab!;
		expect(tab.mime).toBe('text/plain');
		expect(tab.status).toBe('ready');
		expect(tab.filename).toBe('Chevron v. NRDC');
		expect(tab.contentUrl).toBe('/research/opinions/42/text');
		expect(tab.cite.verificationApplicable).toBe(false);
	});
	it('dedupes by opinion id (refocus, no duplicate tab)', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 42, caseName: 'A' });
		dp.openOpinion({ opinionId: 42, caseName: 'A' });
		expect(dp.tabs).toHaveLength(1);
		expect(dp.activeId).toBe('opinion:42');
	});
	it('coexists with a file tab and the file open() path is unchanged', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 7, caseName: 'B' });
		expect(dp.tabs[0].contentUrl).toBe('/research/opinions/7/text');
	});
});
