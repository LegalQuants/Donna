import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

const event = (name = 'case-law-research') => ({ params: { name } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('skill inspector load', () => {
	it('loads the full skill via the /contents endpoint', async () => {
		const skill = {
			name: 'case-law-research',
			title: 'Case-law research',
			tool_usage: ['courtlistener']
		};
		lqFetch.mockResolvedValue(new Response(JSON.stringify(skill), { status: 200 }));
		const out = await load(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/case-law-research/contents');
		expect((out as { skill: typeof skill }).skill.title).toBe('Case-law research');
	});

	it('404s for an unknown skill', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(load(event('nope'))).rejects.toMatchObject({ status: 404 });
	});

	it('502s on a backend error', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(load(event())).rejects.toMatchObject({ status: 502 });
	});
});
