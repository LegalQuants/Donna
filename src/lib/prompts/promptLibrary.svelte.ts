import type { SavedPrompt, SavedPromptInput } from './types';

export function createPromptLibrary() {
	let prompts = $state<SavedPrompt[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	function seed(list: SavedPrompt[]) {
		prompts = list;
		loaded = true;
	}

	async function ensureLoaded(fetchFn: typeof fetch = fetch) {
		if (loaded || loading) return;
		loading = true;
		error = null;
		try {
			const res = await fetchFn('/prompts/items');
			if (!res.ok) throw new Error(String(res.status));
			prompts = (await res.json()) as SavedPrompt[];
			loaded = true;
		} catch {
			error = 'Could not load your prompts.';
		} finally {
			loading = false;
		}
	}

	async function create(input: SavedPromptInput, fetchFn: typeof fetch = fetch): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn('/prompts/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input)
			});
			if (!res.ok) throw new Error(String(res.status));
			const created = (await res.json()) as SavedPrompt;
			prompts = [created, ...prompts];
			return true;
		} catch {
			error = 'Could not save the prompt.';
			return false;
		}
	}

	async function update(
		id: string,
		patch: Partial<SavedPromptInput>,
		fetchFn: typeof fetch = fetch
	): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn(`/prompts/items/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) throw new Error(String(res.status));
			const updated = (await res.json()) as SavedPrompt;
			prompts = prompts.map((p) => (p.id === id ? updated : p));
			return true;
		} catch {
			error = 'Could not update the prompt.';
			return false;
		}
	}

	async function remove(id: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn(`/prompts/items/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(String(res.status));
			prompts = prompts.filter((p) => p.id !== id);
			return true;
		} catch {
			error = 'Could not delete the prompt.';
			return false;
		}
	}

	return {
		get prompts() {
			return prompts;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		seed,
		ensureLoaded,
		create,
		update,
		remove
	};
}
