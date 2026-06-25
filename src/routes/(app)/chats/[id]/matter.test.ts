import { describe, it, expect, vi } from 'vitest';
import { resolveMatter } from './matter';

describe('resolveMatter', () => {
	it('returns id/name + privileged/minimumTier for a scoped chat', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(
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
		expect(await resolveMatter(fetcher, 'p1')).toEqual({
			id: 'p1',
			name: 'Acme MSA',
			privileged: true,
			minimumTier: 4
		});
		expect(fetcher.mock.calls[0][0]).toBe('/api/v1/projects/p1');
	});

	it('defaults privileged=false and minimumTier=null when the project omits them', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'p1', name: 'Acme MSA' }), { status: 200 })
			);
		expect(await resolveMatter(fetcher, 'p1')).toEqual({
			id: 'p1',
			name: 'Acme MSA',
			privileged: false,
			minimumTier: null
		});
	});

	it('returns null without fetching when the chat has no project', async () => {
		const fetcher = vi.fn();
		expect(await resolveMatter(fetcher, null)).toBeNull();
		expect(await resolveMatter(fetcher, undefined)).toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('returns null if the project fetch fails', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		expect(await resolveMatter(fetcher, 'p1')).toBeNull();
	});
});
