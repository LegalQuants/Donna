import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
  ({ params: { id: 'c1' }, request: new Request('http://x/chats/c1/messages', { method: 'POST', body: JSON.stringify(body) }) }) as any;

beforeEach(() => lqStream.mockReset());

function sentBody() {
  const calls = lqStream.mock.calls;
  return JSON.parse((calls[calls.length - 1][2] as { body: string }).body);
}

describe('POST messages', () => {
  it('forwards the selected model', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'fast' }));
    expect(sentBody()).toMatchObject({ content: 'hi', model: 'fast', stream: true });
  });

  it('defaults to smart when model is absent', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi' }));
    expect(sentBody().model).toBe('smart');
  });

  it('defaults to smart when model is blank', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: '   ' }));
    expect(sentBody().model).toBe('smart');
  });

  it('forwards skills when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', skills: ['nda-review'] }));
    expect(sentBody().skills).toEqual(['nda-review']);
  });

  it('omits skills when absent or empty', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('skills' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', skills: [] }));
    expect('skills' in sentBody()).toBe(false);
  });
});

describe('POST messages skill_inputs', () => {
  it('forwards skill_inputs when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', skill_inputs: { 'nda-review': { party: 'Acme' } } }));
    expect(sentBody().skill_inputs).toEqual({ 'nda-review': { party: 'Acme' } });
  });

  it('omits skill_inputs when absent or malformed', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('skill_inputs' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', skill_inputs: [1, 2] }));
    expect('skill_inputs' in sentBody()).toBe(false);
  });
});

describe('POST messages file_ids', () => {
  it('forwards file_ids when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', file_ids: ['f1', 'f2'] }));
    expect(sentBody().file_ids).toEqual(['f1', 'f2']);
  });

  it('omits file_ids when absent or malformed', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('file_ids' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', file_ids: 'nope' }));
    expect('file_ids' in sentBody()).toBe(false);
  });
});
