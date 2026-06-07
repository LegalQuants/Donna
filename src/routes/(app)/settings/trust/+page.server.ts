import type { PageServerLoad } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { toChatOptions } from '$lib/models/normalize';
import { toTrustRows, type TrustRow } from '$lib/trust/trust';
import type { ModelsListResponse } from '$lib/models/types';
import type { components } from '$lib/api/backend';

type TierConfig = components['schemas']['TierConfigResponse'];

export const load: PageServerLoad = async (event) => {
	let rows: TrustRow[] = [];
	let modelsError = false;
	const modelsRes = await lqFetch(event, '/api/v1/models');
	if (modelsRes.ok) {
		const body = (await modelsRes.json()) as ModelsListResponse;
		rows = toTrustRows(toChatOptions(body.data ?? []));
	} else {
		modelsError = true;
	}

	let tierConfig: TierConfig | null = null;
	const cfgRes = await lqFetch(event, '/api/v1/inference/tier-config');
	if (cfgRes.ok) tierConfig = (await cfgRes.json()) as TierConfig;

	return { rows, modelsError, tierConfig };
};
