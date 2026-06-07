import type { ChatModelOption, ModelsListResponse } from './types';
import { toChatOptions } from './normalize';

const STORAGE_KEY = 'donna.model';
const DEFAULT_MODEL = 'smart';
const FALLBACK_OPTIONS: ChatModelOption[] = [
	{ id: 'smart', label: '', resolvedModel: null, group: 'cloud', tier: null }
];

const hasStorage = () => typeof localStorage !== 'undefined';

function readStored(): string {
	if (!hasStorage()) return DEFAULT_MODEL;
	try {
		return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;
	} catch {
		return DEFAULT_MODEL;
	}
}

export function createModelStore() {
	let selectedModel = $state(readStored());
	let options = $state<ChatModelOption[]>([]);
	let loading = $state(false);
	let error = $state(false);
	let loaded = false;

	function setModel(id: string) {
		selectedModel = id;
		if (!hasStorage()) return;
		try {
			localStorage.setItem(STORAGE_KEY, id);
		} catch {
			/* private mode / storage disabled — selection stays in memory only */
		}
	}

	function ensureValidSelection() {
		if (!options.some((o) => o.id === selectedModel)) setModel(DEFAULT_MODEL);
	}

	async function load(fetchFn: typeof fetch = fetch) {
		if (loaded) return;
		loading = true;
		error = false;
		try {
			const res = await fetchFn('/models');
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as ModelsListResponse;
			const opts = toChatOptions(body.data ?? []);
			options = opts.length ? opts : FALLBACK_OPTIONS;
		} catch {
			error = true;
			options = FALLBACK_OPTIONS;
		} finally {
			ensureValidSelection();
			loaded = true;
			loading = false;
		}
	}

	return {
		get selectedModel() {
			return selectedModel;
		},
		get options() {
			return options;
		},
		get selectedOption() {
			return options.find((o) => o.id === selectedModel) ?? null;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		setModel,
		load
	};
}

/** App-global singleton: the composer's model selection. */
export const modelStore = createModelStore();
