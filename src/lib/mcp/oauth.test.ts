import { describe, it, expect } from 'vitest';
import { parseOAuthServers, oauthExpiry } from './oauth';

describe('parseOAuthServers', () => {
	it('parses valid rows', () => {
		const out = parseOAuthServers({
			servers: [
				{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2026-07-01T00:00:00Z' }
			]
		});
		expect(out).toEqual([
			{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2026-07-01T00:00:00Z' }
		]);
	});
	it('drops rows without a string server and coerces missing fields', () => {
		const out = parseOAuthServers({ servers: [{ connected: true }, { server: 'a' }, 'nope'] });
		expect(out).toEqual([{ server: 'a', connected: false, scopes: [], expires_at: null }]);
	});
	it('returns [] for non-object / missing / non-array servers', () => {
		expect(parseOAuthServers(null)).toEqual([]);
		expect(parseOAuthServers({})).toEqual([]);
		expect(parseOAuthServers({ servers: 'x' })).toEqual([]);
	});
});

describe('oauthExpiry', () => {
	const now = Date.parse('2026-06-18T00:00:00Z');
	it('null / invalid -> none', () => {
		expect(oauthExpiry(null, now)).toBe('none');
		expect(oauthExpiry('not-a-date', now)).toBe('none');
	});
	it('past -> expired', () => {
		expect(oauthExpiry('2026-06-17T00:00:00Z', now)).toBe('expired');
	});
	it('within 24h -> expiring', () => {
		expect(oauthExpiry('2026-06-18T12:00:00Z', now)).toBe('expiring');
	});
	it('far future -> valid', () => {
		expect(oauthExpiry('2026-07-01T00:00:00Z', now)).toBe('valid');
	});
});
