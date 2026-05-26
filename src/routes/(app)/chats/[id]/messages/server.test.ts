import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
  ({ params: { id: 'c1' }, request: new Request('http://x/chats/c1/messages', { method: 'POST', body: JSON.stringify(body) }) }) as any;

beforeEach(() => lqStream.mockReset());

function sentBody() {
  return JSON.parse((lqStream.mock.calls[0][2] as { body: string }).body);
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
});
