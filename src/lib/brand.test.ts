import { describe, it, expect } from 'vitest';
import { rebrandName } from './brand';

describe('rebrandName', () => {
	it('rebrands the seeded LQ.AI display name to Donna', () => {
		expect(rebrandName('LQ.AI Administrator')).toBe('Donna Administrator');
	});

	it('matches the brand token case-insensitively and with/without the dot or space', () => {
		expect(rebrandName('LQ.ai')).toBe('Donna');
		expect(rebrandName('LQAI')).toBe('Donna');
		expect(rebrandName('LQ AI')).toBe('Donna');
	});

	it('leaves names without the brand token untouched', () => {
		expect(rebrandName('Ada Counsel')).toBe('Ada Counsel');
	});

	it('returns an empty string for nullish input (so callers can fall back)', () => {
		expect(rebrandName(null)).toBe('');
		expect(rebrandName(undefined)).toBe('');
		expect(rebrandName('')).toBe('');
	});
});
