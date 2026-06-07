import { describe, it, expect } from 'vitest';
import { parseDataPayload, createSseParser } from './sse';

describe('parseDataPayload', () => {
	it('recognizes [DONE]', () => {
		expect(parseDataPayload('[DONE]')).toEqual({ type: 'done' });
	});
	it('parses a delta frame', () => {
		expect(
			parseDataPayload(
				'{"type":"delta","delta":"hi","lq_ai_message_id":"m1","routed_inference_tier":3}'
			)
		).toMatchObject({ type: 'delta', delta: 'hi', routed_inference_tier: 3 });
	});
	it('maps the detail error envelope to an error frame', () => {
		expect(parseDataPayload('{"detail":{"code":"gateway_timeout","message":"timed out"}}')).toEqual(
			{ type: 'error', code: 'gateway_timeout', message: 'timed out' }
		);
	});
	it('returns null for non-JSON', () => {
		expect(parseDataPayload('not json')).toBeNull();
	});
	it('skips a malformed delta frame missing its delta field', () => {
		expect(parseDataPayload('{"type":"delta","lq_ai_message_id":"m1"}')).toBeNull();
	});
	it('skips a complete frame missing its message', () => {
		expect(parseDataPayload('{"type":"complete","lq_ai_message_id":"m1"}')).toBeNull();
	});
	it('parses a bare typed error frame (no detail wrapper)', () => {
		expect(parseDataPayload('{"type":"error","code":"x","message":"boom"}')).toEqual({
			type: 'error',
			code: 'x',
			message: 'boom'
		});
	});
});

describe('createSseParser', () => {
	it('emits one frame for a complete event', () => {
		const p = createSseParser();
		const frames = p.push('data: {"type":"start","lq_ai_message_id":"m1","chat_id":"c1"}\n\n');
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ type: 'start', lq_ai_message_id: 'm1' });
	});
	it('buffers a frame split across two chunks', () => {
		const p = createSseParser();
		expect(p.push('data: {"type":"delta","delta":"he')).toHaveLength(0);
		const frames = p.push('llo","lq_ai_message_id":"m1"}\n\n');
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ type: 'delta', delta: 'hello' });
	});
	it('emits multiple frames in one chunk and stops at [DONE]', () => {
		const p = createSseParser();
		const frames = p.push(
			'data: {"type":"delta","delta":"a","lq_ai_message_id":"m1"}\n\n' + 'data: [DONE]\n\n'
		);
		expect(frames.map((f) => f.type)).toEqual(['delta', 'done']);
	});
});
