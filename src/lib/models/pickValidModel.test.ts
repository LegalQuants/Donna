import { describe, it, expect } from 'vitest';
import type { ChatModelOption } from './types';
import { pickValidModel } from './pickValidModel';

const opts: ChatModelOption[] = [
	{ id: 'smart', label: 'Opus 4.7', resolvedModel: 'x', group: 'cloud', tier: 4 },
	{ id: 'fast', label: 'Sonnet 4.6', resolvedModel: 'x', group: 'cloud', tier: 4 },
	{ id: 'local', label: 'qwen', resolvedModel: 'x', group: 'local', tier: 1 }
];

describe('pickValidModel', () => {
	it('returns the current id when no floor is set', () => {
		expect(pickValidModel(opts, 'local', null)).toBe('local');
		expect(pickValidModel(opts, 'smart', null)).toBe('smart');
	});

	it('returns the current id when it satisfies the floor', () => {
		expect(pickValidModel(opts, 'smart', 4)).toBe('smart');
		expect(pickValidModel(opts, 'local', 1)).toBe('local');
	});

	it('returns "smart" when the current selection is sub-floor and smart is valid', () => {
		expect(pickValidModel(opts, 'local', 2)).toBe('smart');
		expect(pickValidModel(opts, 'local', 4)).toBe('smart');
	});

	it('falls back to the highest-tier valid option when smart itself is sub-floor', () => {
		// Both "smart" and "fast" are tier 4; with "smart" removed, "fast" is the next-highest valid option.
		const noSmart = opts.filter((o) => o.id !== 'smart');
		expect(pickValidModel(noSmart, 'local', 3)).toBe('fast');
	});

	it('returns the current id (no-op) when no option is valid', () => {
		// tier 5 floor with cloud at tier 4: nothing valid → keep current selection.
		expect(pickValidModel(opts, 'local', 5)).toBe('local');
		expect(pickValidModel(opts, 'smart', 5)).toBe('smart');
	});

	it('returns the current id when options is empty', () => {
		expect(pickValidModel([], 'smart', 4)).toBe('smart');
	});

	it('treats options with tier=null as always valid', () => {
		const withNull: ChatModelOption[] = [
			{ id: 'mystery', label: '', resolvedModel: null, group: 'cloud', tier: null }
		];
		expect(pickValidModel(withNull, 'mystery', 5)).toBe('mystery');
	});

	it('falls back to "smart" when currentId is not in options and smart is valid', () => {
		expect(pickValidModel(opts, 'unknown-model', 4)).toBe('smart');
	});
});
