import { fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad, Actions } from './$types';
import type { ModelsListResponse } from '$lib/models/types';
import {
	availableTargets,
	orderedChatCategories,
	categoryFromEntry,
	categoryFromOption,
	localModels,
	reassignPatchBody
} from '$lib/inference/inference';
import type { AdminAliasEntry, CategoryView, ModelTarget } from '$lib/inference/types';
import { parseProviderKeys, type ProviderKeyRow } from '$lib/inference/providerKeys';

export const load: PageServerLoad = async (event) => {
	const isAdmin = !!event.locals.user?.is_admin;

	const modelsRes = await lqFetch(event, '/api/v1/models');
	if (!modelsRes.ok) {
		return {
			isAdmin,
			categories: [] as CategoryView[],
			targets: [] as ModelTarget[],
			localModels: [] as ModelTarget[],
			modelsError: true,
			providerKeys: null as ProviderKeyRow[] | null
		};
	}
	const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
	const options = orderedChatCategories(raw);
	const targets = availableTargets(raw);
	const local = localModels(raw);

	let categories: CategoryView[];
	let providerKeys: ProviderKeyRow[] | null = null;
	if (isAdmin) {
		const [aRes, pkRes] = await Promise.all([
			lqFetch(event, '/api/v1/admin/aliases'),
			lqFetch(event, '/api/v1/admin/provider-keys')
		]);
		const entries = aRes.ok
			? (((await aRes.json()) as { data: AdminAliasEntry[] }).data ?? [])
			: [];
		const byName = new Map(entries.map((e) => [e.name, e]));
		categories = options.map((o) => {
			const e = byName.get(o.id);
			return e ? categoryFromEntry(e) : categoryFromOption(o);
		});
		if (pkRes.ok) {
			try {
				providerKeys = parseProviderKeys(await pkRes.json());
			} catch {
				providerKeys = null; // non-JSON body → degraded card
			}
		}
	} else {
		categories = options.map(categoryFromOption);
	}

	return { isAdmin, categories, targets, localModels: local, modelsError: false, providerKeys };
};

export const actions: Actions = {
	reassign: async (event) => {
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '');
		const targetId = String(data.get('target_id') ?? '');
		if (!name || !targetId) return fail(400, { message: 'Missing category or model.' });

		const modelsRes = await lqFetch(event, '/api/v1/models');
		if (!modelsRes.ok) return fail(502, { message: 'Could not load models.' });
		const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
		const target = availableTargets(raw).find((t) => t.id === targetId);
		if (!target) return fail(400, { message: 'Unknown model.' });

		const getRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`);
		if (getRes.status === 403)
			return fail(403, { message: 'Changing model routing requires an admin account.' });
		if (!getRes.ok)
			return fail(getRes.status === 404 ? 404 : 502, { message: 'Could not read the category.' });
		const entry = (await getRes.json()) as AdminAliasEntry;

		const patchRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`, {
			method: 'PATCH',
			body: JSON.stringify(reassignPatchBody(entry, target))
		});
		if (patchRes.status === 403)
			return fail(403, { message: 'Changing model routing requires an admin account.' });
		if (!patchRes.ok)
			return fail(patchRes.status >= 400 && patchRes.status < 500 ? 400 : 502, {
				message: 'Could not update the category.'
			});
		return { success: true };
	},

	setKey: async (event) => {
		const data = await event.request.formData();
		const provider = String(data.get('provider') ?? '');
		const apiKey = String(data.get('api_key') ?? '');
		if (!provider || !apiKey.trim()) return fail(400, { provider, message: 'Enter a key first.' });

		const res = await lqFetch(event, '/api/v1/admin/provider-keys', {
			method: 'POST',
			body: JSON.stringify({ provider, api_key: apiKey.trim() })
		});
		if (res.status === 403)
			return fail(403, { provider, message: 'Managing provider keys requires an admin account.' });
		if (res.status === 404) return fail(404, { provider, message: 'Unknown provider.' });
		if (res.status === 400) {
			// The 400's detail may be a plain string OR the structured LQAIError
			// envelope — sniff the raw body for the master-key cause either way.
			const body = await res.text().catch(() => '');
			return fail(400, {
				provider,
				message: /master.?key/i.test(body)
					? "The gateway has no master key set, so runtime keys can't be stored — ask your operator to configure LQ_AI_GATEWAY_MASTER_KEY."
					: 'Could not save the key.'
			});
		}
		if (!res.ok) return fail(502, { provider, message: 'Could not save the key.' });
		return { success: true, provider };
	},

	revokeKey: async (event) => {
		const data = await event.request.formData();
		const provider = String(data.get('provider') ?? '');
		if (!provider) return fail(400, { provider, message: 'Missing provider.' });

		const res = await lqFetch(
			event,
			`/api/v1/admin/provider-keys/${encodeURIComponent(provider)}`,
			{ method: 'DELETE' }
		);
		if (res.status === 409)
			return fail(409, {
				provider,
				message:
					"This key can't be revoked here — it comes from the deployment environment, or was already removed."
			});
		if (res.status === 403)
			return fail(403, { provider, message: 'Managing provider keys requires an admin account.' });
		if (res.ok || res.status === 404) return { success: true, provider }; // 404 = provider unknown — treat as gone (idempotent from the UI's perspective)
		return fail(502, { provider, message: 'Could not revoke the key.' });
	}
};
