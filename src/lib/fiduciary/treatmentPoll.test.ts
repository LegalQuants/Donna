import { describe, it, expect, vi } from 'vitest';
import { createTreatmentPoll } from './treatmentPoll.svelte';

const CHAT_ID = 'c1';
const MSG_ID = 'm1';

function ledgerBody(treatment: unknown) {
	return {
		entries: [
			{
				id: 'e1',
				message_id: MSG_ID,
				source_kind: 'caselaw',
				verification_status: 'verified',
				confidence: 0.9,
				provider: 'courtlistener',
				retrieved_at: 'x',
				treatment_id: treatment ? 't1' : null,
				treatment,
				created_at: 'x',
				source: {
					kind: 'caselaw',
					source_file_id: null,
					opinion_id: 1,
					cluster_id: 1,
					external_ref: null,
					provider: 'courtlistener',
					label: 'Some v. Case',
					subtitle: null,
					url: null,
					tool: null,
					passages: []
				}
			}
		],
		gates: []
	};
}

function okResponse(body: unknown) {
	return { ok: true, json: async () => body } as unknown as Response;
}

describe('createTreatmentPoll', () => {
	it('stops once a caselaw entry’s treatment populates', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(okResponse(ledgerBody(null)))
			.mockResolvedValueOnce(okResponse(ledgerBody({})));

		const poll = createTreatmentPoll(CHAT_ID, MSG_ID, { intervalMs: 1, fetchFn });
		await poll.start();

		expect(poll.done).toBe(true);
		expect(poll.entries).toHaveLength(1);
		expect(poll.entries?.[0].treatment).not.toBeNull();
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('caps at maxAttempts when treatment never populates', async () => {
		const fetchFn = vi.fn().mockResolvedValue(okResponse(ledgerBody(null)));

		const poll = createTreatmentPoll(CHAT_ID, MSG_ID, {
			intervalMs: 1,
			maxAttempts: 3,
			fetchFn
		});
		await poll.start();

		expect(poll.done).toBe(true);
		expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(3);
		expect(poll.entries?.[0].treatment).toBeNull();
	});

	it('keeps last-known-good entries when a later tick transport-fails', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(okResponse(ledgerBody(null)))
			.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);

		const poll = createTreatmentPoll(CHAT_ID, MSG_ID, { intervalMs: 1, fetchFn });
		await poll.start();

		expect(poll.done).toBe(true);
		expect(poll.entries).toHaveLength(1);
		expect(poll.entries?.[0].id).toBe('e1');
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
});
