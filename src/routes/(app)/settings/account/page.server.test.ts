// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions } from './+page.server';

const formEvent = (fields: Record<string, string>) =>
	({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('disableMfa action', () => {
	it('rejects empty fields without calling the backend', async () => {
		const r = await actions.disableMfa(formEvent({ password: '', code: '' }));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('POSTs password+code and returns success on 204', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const r = await actions.disableMfa(formEvent({ password: 'pw', code: '123456' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/auth/mfa/disable');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ password: 'pw', code: '123456' });
		expect(r).toEqual({ success: true });
	});

	it('maps 401 to a generic inline error', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 401 }));
		const r = await actions.disableMfa(formEvent({ password: 'pw', code: '000000' }));
		expect(r).toMatchObject({
			status: 401,
			data: { mfaError: expect.stringMatching(/incorrect/i) }
		});
	});

	it('maps other (5xx) failures to a generic retry error', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
		const r = await actions.disableMfa(formEvent({ password: 'pw', code: '123456' }));
		expect(r).toMatchObject({
			status: 502,
			data: { mfaError: expect.stringMatching(/could not disable/i) }
		});
	});
});

describe('updateProfile action', () => {
	it('rejects empty/whitespace display_name without calling the backend', async () => {
		const r = await actions.updateProfile(formEvent({ display_name: '   ' }));
		expect(r).toMatchObject({
			status: 400,
			data: { profileError: expect.stringMatching(/name/i) }
		});
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('PATCHes /users/me with the trimmed name and returns profileSaved on 200', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: 'u1', display_name: 'New Name' }), { status: 200 })
		);
		const r = await actions.updateProfile(formEvent({ display_name: '  New Name  ' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ display_name: 'New Name' });
		expect(r).toEqual({ profileSaved: true });
	});

	it('maps backend 422 to an inline validation error', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 422 }));
		const r = await actions.updateProfile(formEvent({ display_name: 'x' }));
		expect(r).toMatchObject({
			status: 400,
			data: { profileError: expect.stringMatching(/name/i) }
		});
	});

	it('maps other (5xx) failures to a generic retry error', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
		const r = await actions.updateProfile(formEvent({ display_name: 'x' }));
		expect(r).toMatchObject({
			status: 502,
			data: { profileError: expect.stringMatching(/could not update/i) }
		});
	});
});
