import { describe, it, expect, vi } from 'vitest';
import { createEnhance } from './enhance.svelte';

const okResp = (over: Record<string, unknown> = {}) =>
	new Response(
		JSON.stringify({
			interaction_id: 'i1',
			expansion_applied: true,
			expanded_prompt: 'BIG',
			reasoning: ['a'],
			...over
		}),
		{ status: 200 }
	);

describe('createEnhance', () => {
	it('run posts raw_input + chat_id + attached_skills and enters preview', async () => {
		const f = vi.fn().mockResolvedValue(okResp());
		const e = createEnhance('c1', () => ['nda-review']);
		await e.run('review this nda', f);
		expect(f.mock.calls[0][0]).toBe('/enhance-prompt');
		const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
		expect(body).toEqual({
			raw_input: 'review this nda',
			chat_id: 'c1',
			attached_skills: [{ name: 'nda-review' }]
		});
		expect(e.status).toBe('preview');
		expect(e.result?.expanded_prompt).toBe('BIG');
	});

	it('enters skipped when expansion_applied is false', async () => {
		const f = vi
			.fn()
			.mockResolvedValue(okResp({ expansion_applied: false, expanded_prompt: 'review this nda' }));
		const e = createEnhance('c1', () => []);
		await e.run('review this nda', f);
		expect(e.status).toBe('skipped');
	});

	it('enters error on a non-ok response', async () => {
		const f = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		const e = createEnhance('c1', () => []);
		await e.run('hi', f);
		expect(e.status).toBe('error');
	});

	it('does not run on a blank draft', async () => {
		const f = vi.fn();
		const e = createEnhance('c1', () => []);
		await e.run('   ', f);
		expect(f).not.toHaveBeenCalled();
		expect(e.status).toBe('idle');
	});

	it('accept returns expanded_prompt, PATCHes used:true, and resets', async () => {
		const e = createEnhance('c1', () => []);
		await e.run('hi', vi.fn().mockResolvedValue(okResp()));
		const patch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		const text = e.accept(patch);
		expect(text).toBe('BIG');
		expect(patch.mock.calls[0][0]).toBe('/enhance-prompt/i1');
		expect((patch.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
		expect(JSON.parse((patch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
			used: true
		});
		expect(e.status).toBe('idle');
		expect(e.result).toBeNull();
	});

	it('discard PATCHes used:false and resets', async () => {
		const e = createEnhance('c1', () => []);
		await e.run('hi', vi.fn().mockResolvedValue(okResp()));
		const patch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		e.discard(patch);
		expect(JSON.parse((patch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
			used: false
		});
		expect(e.status).toBe('idle');
		expect(e.result).toBeNull();
	});

	it('sends chat_id: null when constructed with a null chatId (standalone landing enhance)', async () => {
		let capturedBody: unknown;
		const fetchFn = (async (_url: string, init: RequestInit) => {
			capturedBody = JSON.parse(init.body as string);
			return new Response(
				JSON.stringify({
					expansion_applied: true,
					expanded_prompt: 'better',
					interaction_id: 'i1'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		}) as unknown as typeof fetch;

		const e = createEnhance(null, () => ['nda-review']);
		await e.run('draft a clause', fetchFn);

		expect(capturedBody).toEqual({
			raw_input: 'draft a clause',
			chat_id: null,
			attached_skills: [{ name: 'nda-review' }]
		});
		expect(e.status).toBe('preview');
	});
});
