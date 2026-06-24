import { describe, it, expect } from 'vitest';
import { parseChat } from './chat';

describe('parseChat', () => {
	it('extracts sticky_skills as a string array', () => {
		expect(parseChat({ id: 'c1', sticky_skills: ['a', 'b'] }).stickySkills).toEqual(['a', 'b']);
	});
	it('drops non-string entries', () => {
		expect(parseChat({ sticky_skills: ['a', 2, null, 'b'] }).stickySkills).toEqual(['a', 'b']);
	});
	it('returns [] when sticky_skills is missing or not an array', () => {
		expect(parseChat({ id: 'c1' }).stickySkills).toEqual([]);
		expect(parseChat({ sticky_skills: 'nope' }).stickySkills).toEqual([]);
	});
	it('returns [] for non-object input', () => {
		expect(parseChat(null).stickySkills).toEqual([]);
		expect(parseChat([1, 2]).stickySkills).toEqual([]);
	});
});
