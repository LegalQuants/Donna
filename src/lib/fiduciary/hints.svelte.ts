// src/lib/fiduciary/hints.svelte.ts
// Dismissal state for the fiduciary discovery hints (Slice 6-lean). A Set of
// dismissed hint ids persisted to localStorage. Mirrors models/store.svelte.ts:
// hasStorage() SSR guard + try/catch (private-mode safe); honest degradation —
// a malformed/absent value yields an empty set and never throws (a lost
// dismissal simply re-shows the hint). No backend dependency.
export const DISMISSED_HINTS_KEY = 'donna.dismissedHints';

const hasStorage = () => typeof localStorage !== 'undefined';

function readStored(): Set<string> {
	if (!hasStorage()) return new Set();
	try {
		const raw = localStorage.getItem(DISMISSED_HINTS_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? new Set(parsed.filter((v): v is string => typeof v === 'string'))
			: new Set();
	} catch {
		return new Set();
	}
}

export function createHintStore() {
	let dismissed = $state<Set<string>>(readStored());

	function isDismissed(id: string): boolean {
		return dismissed.has(id);
	}
	function dismiss(id: string): void {
		if (dismissed.has(id)) return;
		// Reassign (not mutate) so Svelte tracks the change.
		dismissed = new Set(dismissed).add(id);
		if (!hasStorage()) return;
		try {
			localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify([...dismissed]));
		} catch {
			/* private mode / storage disabled — dismissal stays in memory only */
		}
	}

	return { isDismissed, dismiss };
}

/** App-global singleton: which discovery hints the user has dismissed. */
export const hintStore = createHintStore();
