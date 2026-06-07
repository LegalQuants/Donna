import { describe, it, expect } from 'vitest';
import { parsePrivilegeFields } from './parseFormFields';

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.append(k, v);
	return f;
};

describe('parsePrivilegeFields', () => {
	it('defaults to non-privileged with null tier when both fields are absent', () => {
		expect(parsePrivilegeFields(fd({}))).toEqual({
			privileged: false,
			minimum_inference_tier: null
		});
	});

	it('parses privileged="on" and a numeric tier string', () => {
		expect(parsePrivilegeFields(fd({ privileged: 'on', minimum_inference_tier: '4' }))).toEqual({
			privileged: true,
			minimum_inference_tier: 4
		});
	});

	it('treats privileged values other than "on" as unchecked', () => {
		expect(parsePrivilegeFields(fd({ privileged: 'off' }))).toEqual({
			privileged: false,
			minimum_inference_tier: null
		});
	});

	it('normalizes tier=""  to null (None option)', () => {
		expect(parsePrivilegeFields(fd({ minimum_inference_tier: '' }))).toEqual({
			privileged: false,
			minimum_inference_tier: null
		});
	});

	it('rejects out-of-range tier values (e.g. "0", "6", "NaN") to null', () => {
		expect(
			parsePrivilegeFields(fd({ minimum_inference_tier: '0' })).minimum_inference_tier
		).toBeNull();
		expect(
			parsePrivilegeFields(fd({ minimum_inference_tier: '6' })).minimum_inference_tier
		).toBeNull();
		expect(
			parsePrivilegeFields(fd({ minimum_inference_tier: 'nope' })).minimum_inference_tier
		).toBeNull();
	});

	it('accepts each valid tier 1..5', () => {
		for (const t of [1, 2, 3, 4, 5] as const) {
			expect(
				parsePrivilegeFields(fd({ minimum_inference_tier: String(t) })).minimum_inference_tier
			).toBe(t);
		}
	});
});
