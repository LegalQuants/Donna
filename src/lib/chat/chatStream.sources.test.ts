import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom provides no fetch; stub it per-test.
const fetchMock = vi.fn();
beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) });
});

import { createChatStream } from './chatStream.svelte';

// A minimal SSE Response body: start → delta → complete → done. NOTE: the parser
// (src/lib/chat/sse.ts) keys off the `type` field INSIDE the `data:` JSON, ignores
// any `event:` line, and treats `data: [DONE]` as the terminal frame.
function sseResponse(messageId: string, content: string) {
	const frames = [
		`data: ${JSON.stringify({ type: 'start', lq_ai_message_id: messageId, chat_id: 'chat-1' })}\n\n`,
		`data: ${JSON.stringify({ type: 'delta', delta: content, lq_ai_message_id: messageId })}\n\n`,
		`data: ${JSON.stringify({ type: 'complete', lq_ai_message_id: messageId, message: { id: messageId, content } })}\n\n`,
		`data: [DONE]\n\n`
	];
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			const enc = new TextEncoder();
			for (const f of frames) c.enqueue(enc.encode(f));
			c.close();
		}
	});
	return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('chat store loadSources', () => {
	it('fetches and stores external sources after the turn completes', async () => {
		fetchMock.mockImplementation((url: string) => {
			if (url.endsWith('/messages')) return Promise.resolve(sseResponse('mid-1', 'hello'));
			if (url.endsWith('/sources'))
				return Promise.resolve(
					new Response(JSON.stringify([{ label: 'Roe v. Wade', tool: 'search_case_law' }]), {
						status: 200
					})
				);
			// citations + receipts endpoints: empty
			return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
		});

		const store = createChatStream('chat-1');
		await store.send('find a case');

		const assistant = store.messages[store.messages.length - 1];
		expect(assistant.role).toBe('assistant');
		expect(assistant.sources).toEqual([
			expect.objectContaining({ label: 'Roe v. Wade', tool: 'search_case_law' })
		]);
	});

	it('leaves sources undefined when the fetch fails', async () => {
		fetchMock.mockImplementation((url: string) => {
			if (url.endsWith('/messages')) return Promise.resolve(sseResponse('mid-2', 'hi'));
			if (url.endsWith('/sources')) return Promise.resolve(new Response('no', { status: 500 }));
			return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
		});

		const store = createChatStream('chat-1');
		await store.send('hi');

		const assistant = store.messages[store.messages.length - 1];
		expect(assistant.sources).toBeUndefined();
	});
});
