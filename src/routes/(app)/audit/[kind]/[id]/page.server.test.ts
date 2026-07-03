import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

const LEDGER = {
	entries: [
		{
			id: 'e1',
			message_id: 'm1',
			source_kind: 'caselaw',
			verification_status: 'exact_match',
			created_at: '2026-07-03T10:00:00Z'
		}
	],
	gates: [
		{
			message_id: 'm1',
			gate_status: 'fiduciary_grade',
			pass_count: 1,
			supported_count: 0,
			fail_count: 0,
			total_assertions: 1
		}
	]
};

function ev(user: unknown, kind: string, id: string) {
	return { locals: { user }, params: { kind, id } } as never;
}

beforeEach(() => lqFetch.mockReset());

describe('/audit/[kind]/[id] loader', () => {
	it('loads a chat ledger for a privileged caller and hits the chat endpoint', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => LEDGER });
		const out = (await load(ev({ role: 'auditor' }, 'chat', 'c1'))) as {
			kind: string;
			ledger: { entries: unknown[] };
		};
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/chats/c1/ledger');
		expect(out.kind).toBe('chat');
		expect(out.ledger.entries).toHaveLength(1);
	});

	it('loads a session ledger and hits the session endpoint', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => LEDGER });
		await load(ev({ is_admin: true }, 'session', 's1'));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/autonomous/sessions/s1/ledger'
		);
	});

	it('403s a non-privileged caller (no fetch)', async () => {
		await expect(load(ev({ role: 'member' }, 'chat', 'c1'))).rejects.toMatchObject({ status: 403 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('404s an unknown kind', async () => {
		await expect(load(ev({ role: 'auditor' }, 'widget', 'c1'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('404s an existence-safe ledger 404', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
		await expect(load(ev({ role: 'auditor' }, 'chat', 'c1'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('502s other non-ok responses', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
		await expect(load(ev({ role: 'auditor' }, 'chat', 'c1'))).rejects.toMatchObject({
			status: 502
		});
	});
});
