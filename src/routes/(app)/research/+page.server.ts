import type { PageServerLoad } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseCapabilities } from '$lib/research/research';
import { parseSources, type ResearchSource } from '$lib/research/sources';

async function loadSources(event: Parameters<PageServerLoad>[0]): Promise<ResearchSource[] | null> {
	try {
		const res = await lqFetch(event, '/api/v1/research/sources');
		if (!res.ok) return null;
		return parseSources(await res.json());
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async (event) => {
	let capabilities = {
		enabled: false,
		providers: [] as ReturnType<typeof parseCapabilities>['providers']
	};
	try {
		const res = await lqFetch(event, '/api/v1/research/capabilities');
		if (res.ok) capabilities = parseCapabilities(await res.json());
	} catch {
		/* keep the disabled default */
	}
	return { capabilities, sources: await loadSources(event) };
};
