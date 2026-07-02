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

describe('chat load — ledger hydration', () => {
	it('fetches the whole chat ledger once and groups entries/gates onto assistant messages', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string | undefined) => {
			if (!path) return notOk();
			if (path.includes('/messages?')) {
				return ok({
					items: [
						{ id: 'u1', role: 'user', content: 'hi' },
						{ id: 'a1', role: 'assistant', content: 'answer one' },
						{ id: 'a2', role: 'assistant', content: 'answer two' }
					]
				});
			}
			if (path === '/api/v1/chats/chat-1/ledger') {
				return ok({
					entries: [
						{
							id: 'le-1',
							message_id: 'a1',
							source_kind: 'caselaw',
							verification_status: 'verified',
							source: null
						},
						{
							id: 'le-2',
							message_id: 'a1',
							source_kind: 'caselaw',
							verification_status: 'verified',
							source: null
						}
					],
					gates: [{ message_id: 'a1', gate_status: 'fiduciary_grade' }]
				});
			}
			if (path === '/api/v1/chats/chat-1') return ok({ sticky_skills: [] });
			return notOk();
		});

		const res = (await load(event)) as {
			messages: Array<{
				id: string;
				role: string;
				ledgerEntries?: unknown[];
				ledgerGate?: { gate_status: string } | null;
			}>;
		};

		const a1 = res.messages.find((m) => m.id === 'a1')!;
		const a2 = res.messages.find((m) => m.id === 'a2')!;
		const u1 = res.messages.find((m) => m.id === 'u1')!;

		expect(a1.ledgerEntries).toHaveLength(2);
		expect(a1.ledgerGate).toMatchObject({ gate_status: 'fiduciary_grade' });
		// The message without ledger data gets neither field attached.
		expect(a2.ledgerEntries).toBeUndefined();
		expect(a2.ledgerGate).toBeUndefined();
		// Only assistant messages are eligible — a user message never carries ledger fields.
		expect(u1.ledgerEntries).toBeUndefined();
		expect(u1.ledgerGate).toBeUndefined();

		// The ledger is fetched exactly once for the whole chat — no per-message calls.
		const ledgerCalls = lqFetch.mock.calls.filter((c) => c[1] === '/api/v1/chats/chat-1/ledger');
		expect(ledgerCalls).toHaveLength(1);
	});

	it('degrades honestly when the ledger fetch fails — page still loads without ledger fields', async () => {
		// Sequenced, not path-branched: a persistent path-branching mockImplementation
		// that throws for one path is not reliably caught under this repo's vitest +
		// vi.mock setup. Call 1 = messages (ok); call 2 = ledger (throws); everything
		// after falls through to the trailing not-ok stub.
		lqFetch
			.mockImplementationOnce(() =>
				ok({ items: [{ id: 'a1', role: 'assistant', content: 'answer one' }] })
			)
			.mockImplementationOnce(() => {
				throw new Error('network down');
			})
			.mockImplementation(() => notOk());

		const res = (await load(event)) as {
			messages: Array<{ id: string; ledgerEntries?: unknown[]; ledgerGate?: unknown }>;
		};

		expect(res.messages).toHaveLength(1);
		expect(res.messages[0].ledgerEntries).toBeUndefined();
		expect(res.messages[0].ledgerGate).toBeUndefined();
	});
});
