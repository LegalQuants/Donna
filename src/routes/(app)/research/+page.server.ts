import type { PageServerLoad } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseCapabilities } from '$lib/research/research';

export const load: PageServerLoad = async (event) => {
	try {
		const res = await lqFetch(event, '/api/v1/research/capabilities');
		if (!res.ok) return { capabilities: { enabled: false, providers: [] } };
		return { capabilities: parseCapabilities(await res.json()) };
	} catch {
		return { capabilities: { enabled: false, providers: [] } };
	}
};
