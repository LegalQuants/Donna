import { describe, it, expect, vi } from 'vitest';
import { resolveMatter } from './matter';

describe('resolveMatter', () => {
	it('returns id/name + privileged/minimumTier when the chat has a project', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'c1', project_id: 'p1' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'p1',
						name: 'Acme MSA',
						privileged: true,
						minimum_inference_tier: 4
					}),
					{ status: 200 }
				)
			);
		expect(await resolveMatter(fetcher, 'c1')).toEqual({
			id: 'p1',
			name: 'Acme MSA',
			privileged: true,
			minimumTier: 4
		});
		expect(fetcher.mock.calls[0][0]).toBe('/api/v1/chats/c1');
		expect(fetcher.mock.calls[1][0]).toBe('/api/v1/projects/p1');
	});

	it('defaults privileged=false and minimumTier=null when the project omits them', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'c1', project_id: 'p1' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'p1', name: 'Acme MSA' }), { status: 200 })
			);
		expect(await resolveMatter(fetcher, 'c1')).toEqual({
			id: 'p1',
			name: 'Acme MSA',
			privileged: false,
			minimumTier: null
		});
	});

	it('returns null when the chat has no project', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'c1', project_id: null }), { status: 200 })
			);
		expect(await resolveMatter(fetcher, 'c1')).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('returns null if the chat fetch fails', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		expect(await resolveMatter(fetcher, 'c1')).toBeNull();
	});
});
