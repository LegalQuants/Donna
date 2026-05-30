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
      ]))
      // loadAnonymization after retry send
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
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

  it('fetches citations for the assistant message after completion when markers are present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Terminate on \\"thirty days\\" (Source: [1])."}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'cit1', source_file_id: 'f1', source_text: 'thirty days', partial: false, verified: true, verification_method: 'exact_match' }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('when can I terminate?');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/chats/c1/messages/a1/citations');
    expect(chat.messages[1].citations).toHaveLength(1);
    expect(chat.messages[1].citations?.[0].verification_method).toBe('exact_match');
  });

  it('does not fetch citations when the answer has no markers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"No citations here."}}\n\n',
      'data: [DONE]\n\n'
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/citations'))).toBe(false);
  });

  it('retries the citations fetch once when the first response is empty (persist/fetch race)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Quote \\"x\\" (Source: [1])."}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'cit1', source_file_id: 'f1', source_text: 'x', partial: false, verified: true, verification_method: 'exact_match' }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('q');
    expect(chat.messages[1].citations).toHaveLength(1);
  });

  it('sets anonymized from the inference receipt after completion', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { ts: 't', kind: 'inference', detail: { message_id: 'a1', anonymization_applied: true } }
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hello');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/chats/c1/receipts?event_kinds=inference');
    expect(chat.messages[1].anonymized).toBe(true);
  });

  it('posts the chosen model in the request body and reuses it on retry', async () => {
    const frames = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    // Fresh Response per call (a single reused Response would lock its body on the
    // second read). Each stream is followed by a loadAnonymization receipts GET.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(frames()) // call 0: send POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // call 1: loadAnonymization GET
      .mockResolvedValueOnce(frames()) // call 2: retry POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // call 3: loadAnonymization GET
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'fast');
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({ content: 'hi', model: 'fast' });

    await chat.retry();
    // calls[2] is the retry POST (calls[1]/[3] are the receipts GETs, which carry no init).
    const retryBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(retryBody.model).toBe('fast');
    expect(chat.messages[1].status).toBe('done');
    expect(chat.status).toBe('idle');
  });

  it('posts attached skills in the body and reuses them on retry', async () => {
    const frames = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(frames()) // call 0: send POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // call 1: loadAnonymization GET
      .mockResolvedValueOnce(frames()) // call 2: retry POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // call 3: loadAnonymization GET
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['nda-review']);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({ content: 'hi', model: 'smart', skills: ['nda-review'] });

    await chat.retry();
    const retryBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(retryBody.skills).toEqual(['nda-review']);
    expect(chat.messages[1].status).toBe('done');
  });

  it('omits skills from the body when none are attached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect('skills' in body).toBe(false);
  });

  it('captures applied_skills from delta frames', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"delta","delta":"hi","lq_ai_message_id":"a1","applied_skills":["comms-improver"]}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))); // loadAnonymization GET
    const chat = createChatStream('c1');
    await chat.send('hello', 'smart', ['comms-improver']);
    expect(chat.messages[1].applied_skills).toEqual(['comms-improver']);
  });

  it('captures applied_skills from the complete frame message', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi","applied_skills":["nda-review"]}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })));
    const chat = createChatStream('c1');
    await chat.send('hello', 'smart', ['nda-review']);
    expect(chat.messages[1].applied_skills).toEqual(['nda-review']);
  });

  it('clears applied_skills on retry before re-streaming', async () => {
    const withSkill = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"delta","delta":"x","lq_ai_message_id":"a1","applied_skills":["comms-improver"]}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"x"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const noSkill = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"y"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(withSkill())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(noSkill())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })));
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['comms-improver']);
    expect(chat.messages[1].applied_skills).toEqual(['comms-improver']);
    await chat.retry();
    expect(chat.messages[1].applied_skills).toBeUndefined();
  });
});
