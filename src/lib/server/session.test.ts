import { describe, it, expect } from 'vitest';
import {
	setSessionCookies,
	clearSessionCookies,
	AT_COOKIE,
	RT_COOKIE,
	REFRESH_TTL_SECONDS
} from './session';

function fakeEvent() {
	const calls: any[] = [];
	return {
		calls,
		cookies: {
			set: (name: string, value: string, opts: any) => calls.push({ op: 'set', name, value, opts }),
			delete: (name: string, opts: any) => calls.push({ op: 'delete', name, opts })
		}
	} as any;
}

describe('session cookies', () => {
	it('sets httpOnly access + refresh cookies with correct lifetimes', () => {
		const e = fakeEvent();
		setSessionCookies(e, 'AT', 'RT', 900);
		const at = e.calls.find((c: any) => c.name === AT_COOKIE);
		const rt = e.calls.find((c: any) => c.name === RT_COOKIE);
		expect(at.value).toBe('AT');
		expect(at.opts.httpOnly).toBe(true);
		expect(at.opts.sameSite).toBe('lax');
		expect(at.opts.path).toBe('/');
		expect(at.opts.maxAge).toBe(900);
		expect(rt.value).toBe('RT');
		expect(rt.opts.httpOnly).toBe(true);
		expect(rt.opts.sameSite).toBe('lax');
		expect(rt.opts.maxAge).toBe(REFRESH_TTL_SECONDS);
	});

	it('omits refresh cookie when no refresh token is given', () => {
		const e = fakeEvent();
		setSessionCookies(e, 'AT', undefined, 900);
		expect(e.calls.some((c: any) => c.name === RT_COOKIE)).toBe(false);
	});

	it('clears both cookies at the root path', () => {
		const e = fakeEvent();
		clearSessionCookies(e);
		const deletes = e.calls.filter((c: any) => c.op === 'delete');
		expect(deletes).toHaveLength(2);
		expect(deletes.map((c: any) => c.name)).toEqual(expect.arrayContaining([AT_COOKIE, RT_COOKIE]));
		deletes.forEach((c: any) => expect(c.opts.path).toBe('/'));
	});
});
