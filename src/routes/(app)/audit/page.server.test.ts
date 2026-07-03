import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

function ev(user: unknown) {
	return { locals: { user } } as never;
}

describe('/audit landing loader', () => {
	it('allows an auditor', async () => {
		await expect(load(ev({ role: 'auditor', is_admin: false }))).resolves.toEqual({});
	});
	it('allows an admin', async () => {
		await expect(load(ev({ role: 'member', is_admin: true }))).resolves.toEqual({});
	});
	it('403s a member', async () => {
		await expect(load(ev({ role: 'member', is_admin: false }))).rejects.toMatchObject({
			status: 403
		});
	});
});
