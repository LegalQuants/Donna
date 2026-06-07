// src/lib/automations/cron.test.ts
import { describe, it, expect } from 'vitest';
import { PRESETS, describeCron, looksValid } from './cron';

describe('PRESETS', () => {
	it('exposes friendly presets that each pass looksValid', () => {
		expect(PRESETS.length).toBeGreaterThanOrEqual(4);
		for (const p of PRESETS) expect(looksValid(p.expr)).toBe(true);
	});
});

describe('describeCron', () => {
	it('maps an exact preset expression to its friendly label', () => {
		expect(describeCron('0 9 * * *')).toBe('Every day at 9:00');
		expect(describeCron('0 9 * * 1-5')).toBe('Every weekday at 9:00');
	});
	it('normalizes whitespace before matching', () => {
		expect(describeCron('  0   9 * * *  ')).toBe('Every day at 9:00');
	});
	it('falls back to the normalized raw string for non-presets', () => {
		expect(describeCron('15 6 1 * *')).toBe('15 6 1 * *');
	});
});

describe('looksValid', () => {
	it('accepts well-formed 5-field expressions', () => {
		expect(looksValid('0 9 * * *')).toBe(true);
		expect(looksValid('*/5 0-12 1,15 1-12 1-5')).toBe(true);
	});
	it('rejects wrong field counts', () => {
		expect(looksValid('0 9 * *')).toBe(false);
		expect(looksValid('0 9 * * * *')).toBe(false);
		expect(looksValid('')).toBe(false);
	});
	it('rejects out-of-bounds values', () => {
		expect(looksValid('60 9 * * *')).toBe(false); // minute > 59
		expect(looksValid('0 24 * * *')).toBe(false); // hour > 23
		expect(looksValid('0 9 0 * *')).toBe(false); // day-of-month < 1
		expect(looksValid('0 9 * 13 *')).toBe(false); // month > 12
		expect(looksValid('0 9 * * 8')).toBe(false); // day-of-week > 7
	});
	it('rejects malformed tokens and descending ranges', () => {
		expect(looksValid('a 9 * * *')).toBe(false);
		expect(looksValid('5-1 9 * * *')).toBe(false);
		expect(looksValid('*/0 9 * * *')).toBe(false);
	});
});
