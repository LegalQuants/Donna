import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'donna:theme';

/** Re-evaluate the module so its singleton runs `resolveInitial()` against the
 *  current localStorage / matchMedia state. */
function freshImport() {
	vi.resetModules();
	return import('./theme.svelte');
}

beforeEach(() => {
	localStorage.clear();
	document.documentElement.classList.remove('dark');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('theme store', () => {
	it('toggle() flips state, syncs the <html> class, and persists the choice', async () => {
		const { theme } = await freshImport();
		theme.set(false); // known baseline
		expect(theme.isDark).toBe(false);

		theme.toggle();
		expect(theme.isDark).toBe(true);
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(localStorage.getItem(KEY)).toBe('dark');

		theme.toggle();
		expect(theme.isDark).toBe(false);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(localStorage.getItem(KEY)).toBe('light');
	});

	it('an explicit stored choice wins over the OS preference', async () => {
		localStorage.setItem(KEY, 'dark');
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false })) // OS says light…
		);
		const { theme } = await freshImport();
		expect(theme.isDark).toBe(true); // …but the stored 'dark' wins
	});

	it('falls back to the OS preference when nothing is stored', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: true }))
		);
		const { theme } = await freshImport();
		expect(theme.isDark).toBe(true);
	});

	it('defaults to light when nothing is stored and the OS has no dark preference', async () => {
		// jsdom provides no matchMedia; the store guards for that and resolves light.
		const { theme } = await freshImport();
		expect(theme.isDark).toBe(false);
	});
});
