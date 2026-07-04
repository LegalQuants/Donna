import { describe, it, expect } from 'vitest';
import { parseToolProviders, sourceLabel, keyStatus } from './toolProviders';

const RAW = {
	tool_providers: [
		{
			type: 'courtlistener',
			enabled: false,
			name: 'courtlistener-prod',
			has_key: false,
			key_required: true,
			egress_tier: 4
		},
		{
			type: 'edgar',
			enabled: true,
			name: 'edgar-prod',
			has_key: false,
			key_required: false,
			egress_tier: 4
		}
	]
};

describe('parseToolProviders', () => {
	it('parses rows and coerces types', () => {
		const rows = parseToolProviders(RAW);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			type: 'courtlistener',
			enabled: false,
			name: 'courtlistener-prod',
			has_key: false,
			key_required: true,
			egress_tier: 4
		});
		expect(rows[1].enabled).toBe(true);
	});
	it('drops malformed rows (no type) and tolerates a non-array', () => {
		expect(parseToolProviders({ tool_providers: [{ enabled: true }] })).toEqual([]);
		expect(parseToolProviders({})).toEqual([]);
		expect(parseToolProviders(null)).toEqual([]);
	});
	it('defaults booleans safely', () => {
		const [r] = parseToolProviders({ tool_providers: [{ type: 'eurlex' }] });
		expect(r).toEqual({
			type: 'eurlex',
			enabled: false,
			name: null,
			has_key: false,
			key_required: false,
			egress_tier: null
		});
	});
});

describe('sourceLabel', () => {
	it('maps known types and falls back to the raw type', () => {
		expect(sourceLabel('courtlistener')).toMatch(/CourtListener/);
		expect(sourceLabel('edgar')).toMatch(/EDGAR/);
		expect(sourceLabel('mystery')).toBe('mystery');
	});
});

describe('keyStatus', () => {
	it('classifies the key column', () => {
		expect(keyStatus({ key_required: false } as never)).toBe('no_key_needed');
		expect(keyStatus({ key_required: true, has_key: true } as never)).toBe('key_set');
		expect(keyStatus({ key_required: true, has_key: false } as never)).toBe('no_key');
	});
});
