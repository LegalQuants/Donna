import { describe, it, expect, vi, afterEach } from 'vitest';
import { createChatStream } from './chatStream.svelte';

function streamResponse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    }
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('createChatStream', () => {
  it('appends user + assistant, accumulates deltas, finalizes on complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"delta","delta":"Hel","lq_ai_message_id":"a1","routed_inference_tier":3}\n\n',
      'data: {"type":"delta","delta":"lo","lq_ai_message_id":"a1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Hello","routed_inference_tier":3}}\n\n',
      'data: [DONE]\n\n'
    ])));
    const chat = createChatStream('c1');
    await chat.send('hi');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(chat.messages[1]).toMatchObject({ role: 'assistant', content: 'Hello', routed_inference_tier: 3, status: 'done' });
    expect(chat.status).toBe('idle');
  });

  it('sets error status on an error frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"detail":{"code":"gateway_timeout","message":"timed out"}}\n\n'
    ])));
    const chat = createChatStream('c1');
    await chat.send('hi');
    expect(chat.messages[1].status).toBe('error');
    expect(chat.messages[1].error).toMatch(/timed out/);
    expect(chat.status).toBe('error');
  });

  it('marks the assistant done (keeps partial text) when aborted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const chat = createChatStream('c1');
    await chat.send('hi');
    expect(chat.status).toBe('idle');
    expect(chat.messages[1].status).toBe('done');
  });

  it('retry re-runs the last exchange in place without duplicating turns', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"detail":{"code":"gateway_timeout","message":"timed out"}}\n\n'
      ]))
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"delta","delta":"ok now","lq_ai_message_id":"a1","routed_inference_tier":3}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok now","routed_inference_tier":3}}\n\n',
        'data: [DONE]\n\n'
      ]));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi');
    expect(chat.messages[1].status).toBe('error');

    await chat.retry();
    // No duplicate user/assistant turns appended.
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(chat.messages[1]).toMatchObject({ role: 'assistant', content: 'ok now', status: 'done' });
    expect(chat.status).toBe('idle');
  });

  it('preserves partial text when the reader aborts mid-stream', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const enc = new TextEncoder();
        if (pulls === 0) {
          controller.enqueue(enc.encode('data: {"type":"delta","delta":"partial answer","lq_ai_message_id":"a1"}\n\n'));
          pulls++;
        } else {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const chat = createChatStream('c1');
    await chat.send('hi');
    expect(chat.messages[1].content).toBe('partial answer');
    expect(chat.messages[1].status).toBe('done');
    expect(chat.status).toBe('idle');
  });
});
