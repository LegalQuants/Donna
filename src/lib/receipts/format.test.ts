import { describe, it, expect } from 'vitest';
import { describeEvent, anonStatus, anonymizedByMessage } from './format';
import type { ReceiptEvent } from './types';

const ev = (kind: string, detail: Record<string, unknown>): ReceiptEvent => ({
	ts: '2026-05-25T05:04:31Z',
	kind,
	detail
});

describe('describeEvent', () => {
	it('assistant message → label + token detail', () => {
		const v = describeEvent(
			ev('message', {
				role: 'assistant',
				message_kind: 'ai',
				prompt_tokens: 379,
				completion_tokens: 428
			})
		);
		expect(v.label).toBe('Assistant');
		expect(v.detail).toBe('379 prompt · 428 completion tokens');
	});
	it('user message → You', () => {
		expect(describeEvent(ev('message', { role: 'user' })).label).toBe('You');
	});
	it('retrieval → chunk/KB summary', () => {
		const v = describeEvent(
			ev('retrieval', { details: { kb_ids: ['k'], chunk_count: 1, query_token_estimate: 18 } })
		);
		expect(v.label).toMatch(/retrieval/i);
		expect(v.detail).toBe('1 chunk · from 1 KB · ~18 query tokens');
	});
	it('inference → model label, tier, facts', () => {
		const v = describeEvent(
			ev('inference', {
				provider: 'anthropic-prod',
				model: 'claude-opus-4-7',
				tier: 4,
				tokens_in: 379,
				tokens_out: 428,
				latency_ms: 7589,
				refused: false
			})
		);
		expect(v.label).toBe('claude-opus-4-7');
		expect(v.tier).toBe(4);
		expect(v.detail).toBe('anthropic-prod · 379→428 tokens · 7.6s');
		expect(v.tone).toBe('default');
	});
	it('refused/error → error tone + reason', () => {
		const v = describeEvent(
			ev('error', { model: 'x', tier: 5, refused: true, refusal_reason: 'tier-floor not met' })
		);
		expect(v.tone).toBe('error');
		expect(v.label).toMatch(/refused/i);
		expect(v.detail).toBe('tier-floor not met');
	});
	it('skill → name', () => {
		expect(describeEvent(ev('skill', { name: 'nda-review' })).detail).toBe('nda-review');
	});
	it('unknown kind → generic, never throws', () => {
		const v = describeEvent(ev('whatever', {}));
		expect(v.label).toBe('whatever');
		expect(v.tone).toBe('default');
	});
	it('tolerates missing detail fields', () => {
		expect(() => describeEvent(ev('inference', {}))).not.toThrow();
	});
});

describe('anonStatus', () => {
	it('applied / none / null', () => {
		expect(anonStatus(ev('inference', { anonymization_applied: true }))).toBe('applied');
		expect(anonStatus(ev('inference', { anonymization_applied: false }))).toBe('none');
		expect(anonStatus(ev('message', { anonymization_applied: true }))).toBeNull();
	});
	it('applies to error events too', () => {
		expect(anonStatus(ev('error', { anonymization_applied: true }))).toBe('applied');
	});
});

describe('anonymizedByMessage', () => {
	it('maps message_id → anonymization_applied for inference events only', () => {
		const m = anonymizedByMessage([
			ev('inference', { message_id: 'a', anonymization_applied: true }),
			ev('inference', { message_id: 'b', anonymization_applied: false }),
			ev('inference', { message_id: null, anonymization_applied: true }),
			ev('message', { message_id: 'c', anonymization_applied: true })
		]);
		expect(m.get('a')).toBe(true);
		expect(m.get('b')).toBe(false);
		expect(m.has('c')).toBe(false);
		expect(m.size).toBe(2);
	});
	it('includes error (refused) inference events', () => {
		const m = anonymizedByMessage([
			ev('error', { message_id: 'e', anonymization_applied: true, refused: true })
		]);
		expect(m.get('e')).toBe(true);
	});
});
