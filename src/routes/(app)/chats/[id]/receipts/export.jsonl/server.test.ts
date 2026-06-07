import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({ params: { id: 'c1' } }) as any;
beforeEach(() => lqFetch.mockReset());

describe('GET receipts export', () => {
	it('forwards body + content-disposition for download', async () => {
		lqFetch.mockResolvedValue(
			new Response('{"ts":"t"}\n', {
				status: 200,
				headers: {
					'content-type': 'application/x-ndjson',
					'content-disposition': 'attachment; filename="x.jsonl"'
				}
			})
		);
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts/export.jsonl');
		expect(res.headers.get('content-disposition')).toContain('attachment');
		expect(await res.text()).toContain('"ts"');
	});
	it('synthesizes a filename when upstream omits content-disposition', async () => {
		lqFetch.mockResolvedValue(new Response('', { status: 200 }));
		const res = await GET(event());
		expect(res.headers.get('content-disposition')).toContain('chat-c1-receipts.jsonl');
	});
});
