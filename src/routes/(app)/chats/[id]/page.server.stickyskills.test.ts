import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

function ok(json: unknown) {
	return { ok: true, status: 200, json: async () => json };
}
function notOk(status = 404) {
	return { ok: false, status, json: async () => ({}) };
}

const event = {
	params: { id: 'chat-1' },
	cookies: { get: () => undefined, delete: () => {} }
} as never;

beforeEach(() => lqFetch.mockReset());

describe('chat load — sticky skills', () => {
	it('returns the chat sticky_skills set', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string | undefined) => {
			if (!path) return notOk();
			if (path.includes('/messages?')) return ok({ items: [] });
			if (path === '/api/v1/chats/chat-1') return ok({ sticky_skills: ['contract-snapshot'] });
			return notOk();
		});
		const res = (await load(event)) as { stickySkills: string[] };
		expect(res.stickySkills).toEqual(['contract-snapshot']);
	});

	it('degrades to [] when the chat fetch fails', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string | undefined) => {
			if (!path) return notOk();
			if (path.includes('/messages?')) return ok({ items: [] });
			if (path === '/api/v1/chats/chat-1') return notOk(502);
			return notOk();
		});
		const res = (await load(event)) as { stickySkills: string[] };
		expect(res.stickySkills).toEqual([]);
	});
});
