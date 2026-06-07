// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions, load } from './+page.server';

const loadEv = (id = 's1') => ({ params: { id } }) as never;
const formEv = (fields: Record<string, string | string[]>, id = 's1') => {
	const body = new URLSearchParams();
	for (const [k, v] of Object.entries(fields)) {
		if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
		else body.append(k, v);
	}
	return { params: { id }, request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

const skill = (over: Record<string, unknown> = {}) => ({
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA',
	description: 'd',
	version: '1.0.0',
	tags: ['nda'],
	body: 'B',
	slash_alias: '/nda',
	archived_at: null,
	created_at: '',
	updated_at: '',
	...over
});

describe('/skills/[id] load', () => {
	it('GETs the user skill by id', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill()), { status: 200 }));
		const out = (await load(loadEv())) as { skill: { id: string } };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(out.skill.id).toBe('s1');
	});

	it('throws 404 when the skill is missing or not owned', async () => {
		lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 404 });
	});

	it('throws 502 on other backend failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
	});
});

describe('/skills/[id] ?/save', () => {
	it('PATCHes a UserSkillUpdate and returns success', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill()), { status: 200 }));
		const r = await actions.save(
			formEv({
				display_name: 'NDA v2',
				description: 'd2',
				version: '1.1.0',
				body: 'B2',
				tags: ['nda', 'corp'],
				slash_alias: '/nda2'
			})
		);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			display_name: 'NDA v2',
			description: 'd2',
			version: '1.1.0',
			body: 'B2',
			tags: ['nda', 'corp'],
			slash_alias: '/nda2'
		});
		expect(r).toMatchObject({ success: true });
	});

	it('sends slash_alias as null when cleared', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		await actions.save(
			formEv({
				display_name: 'NDA',
				description: 'd',
				version: '1.0.0',
				body: 'B',
				slash_alias: ''
			})
		);
		expect(JSON.parse(lqFetch.mock.calls[0][2].body).slash_alias).toBeNull();
	});

	it('maps a slash_alias 422 to an inline slash_alias error', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					detail: "slash_alias '/taken' is already used by another of your skills."
				}),
				{ status: 422 }
			)
		);
		const r = await actions.save(
			formEv({
				display_name: 'NDA',
				description: 'd',
				body: 'B',
				version: '1.0.0',
				slash_alias: '/taken'
			})
		);
		expect(r).toMatchObject({ status: 422, data: { field: 'slash_alias' } });
	});

	it('maps a non-slash_alias 422 to a general error', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: [{ loc: ['body', 'description'] }] }), { status: 422 })
		);
		const r = await actions.save(
			formEv({ display_name: 'NDA', description: 'd', body: 'B', version: '1.0.0' })
		);
		expect(r).toMatchObject({ status: 422 });
		expect((r as { data?: { field?: string } }).data?.field).toBeUndefined();
	});

	it('maps 404 to a gone error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.save(
			formEv({ display_name: 'NDA', description: 'd', body: 'B', version: '1.0.0' })
		);
		expect(r).toMatchObject({ status: 404, data: { error: 'This skill no longer exists.' } });
	});

	it('rejects empty display_name or body without calling the backend', async () => {
		const r = await actions.save(formEv({ display_name: '', body: '', version: '1.0.0' }));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('/skills/[id] ?/archive', () => {
	it('DELETEs and redirects to /skills on 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await expect(actions.archive(formEv({}))).rejects.toMatchObject({
			status: 303,
			location: '/skills'
		});
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('treats 410 (already archived) as success and still redirects', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 410 }));
		await expect(actions.archive(formEv({}))).rejects.toMatchObject({
			status: 303,
			location: '/skills'
		});
	});

	it('returns fail(502) on other failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.archive(formEv({}));
		expect(r).toMatchObject({ status: 502 });
	});
});
