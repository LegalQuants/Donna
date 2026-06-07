import { describe, it, expect } from 'vitest';
import { parseDraftSkills } from './draftSkills';

describe('parseDraftSkills', () => {
	it('parses a JSON array of slugs', () => {
		expect(parseDraftSkills('["contract-qa","nda-review"]')).toEqual(['contract-qa', 'nda-review']);
	});
	it('returns [] for null/undefined', () => {
		expect(parseDraftSkills(null)).toEqual([]);
		expect(parseDraftSkills(undefined)).toEqual([]);
	});
	it('returns [] for malformed JSON', () => {
		expect(parseDraftSkills('not json')).toEqual([]);
	});
	it('drops non-string entries', () => {
		expect(parseDraftSkills('["a",1,null,"b"]')).toEqual(['a', 'b']);
	});
	it('drops empty-string entries', () => {
		expect(parseDraftSkills('["","a"]')).toEqual(['a']);
	});
	it('returns [] when the JSON is not an array', () => {
		expect(parseDraftSkills('{"a":1}')).toEqual([]);
	});
});
