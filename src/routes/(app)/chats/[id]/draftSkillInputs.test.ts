import { describe, it, expect } from 'vitest';
import { parseDraftSkillInputs } from './draftSkillInputs';

describe('parseDraftSkillInputs', () => {
	it('parses a JSON object of per-skill value maps', () => {
		expect(parseDraftSkillInputs('{"nda-review":{"party":"Acme","count":3}}')).toEqual({
			'nda-review': { party: 'Acme', count: 3 }
		});
	});
	it('returns {} for null/undefined/empty', () => {
		expect(parseDraftSkillInputs(null)).toEqual({});
		expect(parseDraftSkillInputs(undefined)).toEqual({});
		expect(parseDraftSkillInputs('')).toEqual({});
	});
	it('returns {} for malformed JSON', () => {
		expect(parseDraftSkillInputs('not json')).toEqual({});
	});
	it('returns {} when the JSON is not an object', () => {
		expect(parseDraftSkillInputs('[1,2]')).toEqual({});
		expect(parseDraftSkillInputs('"x"')).toEqual({});
	});
	it('drops entries whose value is not a plain object', () => {
		expect(parseDraftSkillInputs('{"a":{"x":1},"b":5,"c":[1]}')).toEqual({ a: { x: 1 } });
	});
});
