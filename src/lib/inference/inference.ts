import { prettifyModel, toChatOptions } from '$lib/models/normalize';
import type { RawModelEntry, ChatModelOption } from '$lib/models/types';
import type { AdminAliasEntry, AdminAliasUpdate, CategoryView, ModelTarget } from './types';

const CANON = ['smart', 'fast', 'budget', 'local', 'local-fast', 'local-thinking'];

/** The assignable concrete models (provider-native entries), cloud then local. */
export function availableTargets(raw: RawModelEntry[]): ModelTarget[] {
	return raw
		.filter((e) => e.lq_ai_kind === 'provider_native')
		.map((e) => {
			const provider = e.owned_by;
			const model = e.id.startsWith(provider + '/') ? e.id.slice(provider.length + 1) : e.id;
			const tier = e.routed_inference_tier ?? null;
			const local = e.provider_type === 'ollama' || tier === 1;
			return {
				id: e.id,
				provider,
				model,
				label: prettifyModel(e.id),
				group: local ? 'local' : 'cloud',
				tier
			} satisfies ModelTarget;
		})
		.sort((a, b) => (a.group === b.group ? 0 : a.group === 'cloud' ? -1 : 1)); // cloud first, stable within group
}

/** Chat-usable alias options (from the shared normalizer) in canonical order. */
export function orderedChatCategories(raw: RawModelEntry[]): ChatModelOption[] {
	const opts = toChatOptions(raw);
	const rank = (id: string) => {
		const i = CANON.indexOf(id);
		return i === -1 ? CANON.length : i;
	};
	return [...opts].sort((a, b) => rank(a.id) - rank(b.id));
}

export function categoryFromEntry(entry: AdminAliasEntry): CategoryView {
	const id = `${entry.provider}/${entry.model}`;
	// /admin/aliases carries no provider_type, so cloud-vs-local is derived from tier alone (tier 1 = local).
	const tier = entry.primary_inference_tier ?? null;
	return {
		name: entry.name,
		backingLabel: prettifyModel(id),
		currentTargetId: id,
		tier,
		group: tier === 1 ? 'local' : 'cloud'
	};
}

/** Non-admin path: a CategoryView from a normalized chat option (no /admin/aliases read). */
export function categoryFromOption(o: ChatModelOption): CategoryView {
	return {
		name: o.id,
		backingLabel: o.label,
		currentTargetId: o.resolvedModel,
		tier: o.tier,
		group: o.group
	};
}

/** New primary provider/model, preserving the alias's existing fallback chain. */
export function reassignPatchBody(entry: AdminAliasEntry, target: ModelTarget): AdminAliasUpdate {
	return { provider: target.provider, model: target.model, fallback: entry.fallback };
}

/** Installed local models = the local subset of the assignable targets. */
export function localModels(raw: RawModelEntry[]): ModelTarget[] {
	return availableTargets(raw).filter((t) => t.group === 'local');
}
