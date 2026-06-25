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

	it('derives the matter from the same chat fetch (one GET /chats/{id})', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string | undefined) => {
			if (!path) return notOk();
			if (path.includes('/messages?')) return ok({ items: [] });
			if (path === '/api/v1/chats/chat-1')
				return ok({ sticky_skills: ['contract-snapshot'], project_id: 'p1' });
			if (path === '/api/v1/projects/p1') return ok({ id: 'p1', name: 'Acme MSA' });
			return notOk();
		});
		const res = (await load(event)) as {
			stickySkills: string[];
			matter: { id: string; name: string } | null;
		};
		expect(res.stickySkills).toEqual(['contract-snapshot']);
		expect(res.matter).toMatchObject({ id: 'p1', name: 'Acme MSA' });
		// The chat object is fetched exactly once across the whole load.
		const chatCalls = lqFetch.mock.calls.filter((c) => c[1] === '/api/v1/chats/chat-1');
		expect(chatCalls).toHaveLength(1);
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
