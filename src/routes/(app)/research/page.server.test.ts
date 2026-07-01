import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

function res(ok: boolean, body: unknown) {
	return { ok, json: async () => body } as unknown as Response;
}

beforeEach(() => lqFetch.mockReset());

describe('research load — sources', () => {
	it('returns parsed sources on success', async () => {
		lqFetch.mockImplementation(async (_e: unknown, path: string) => {
			if (path === '/api/v1/research/capabilities')
				return res(true, { enabled: true, providers: [] });
			if (path === '/api/v1/research/sources')
				return res(true, {
					sources: [{ type: 'govinfo', enabled: true, content_kinds: ['statute'] }]
				});
			return res(false, {});
		});
		const data = (await load({} as never)) as any;
		expect(data.sources).toHaveLength(1);
		expect(data.sources?.[0].type).toBe('govinfo');
	});

	it('degrades sources to null when the fetch is not ok', async () => {
		lqFetch.mockImplementation(async (_e: unknown, path: string) => {
			if (path === '/api/v1/research/capabilities')
				return res(true, { enabled: true, providers: [] });
			return res(false, {});
		});
		const data = (await load({} as never)) as any;
		expect(data.sources).toBeNull();
	});

	it('degrades sources to null when lqFetch throws', async () => {
		// Sequenced, not path-branched: under vitest v4 + vi.mock, a persistent
		// path-branching mockImplementation that throws isn't caught by the SUT's
		// try/catch, but sequential mockImplementationOnce is. Call 1 = capabilities
		// (ok); call 2 = the /research/sources fetch, which rejects.
		lqFetch
			.mockImplementationOnce(async () => res(true, { enabled: true, providers: [] }))
			.mockImplementationOnce(async () => {
				throw new Error('network');
			});
		const data = (await load({} as never)) as any;
		expect(data.sources).toBeNull();
	});
});
