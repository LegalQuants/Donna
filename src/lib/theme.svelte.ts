// Dark-mode controller. The chosen theme is persisted in localStorage; when unset we follow
// the OS `prefers-color-scheme`. The `dark` class on <html> is the single source of truth for
// styling (see app.css `.dark`), and is set pre-paint by the inline script in app.html so this
// store only has to keep it in sync after hydration. All browser-only APIs are SSR-guarded.

const THEME_KEY = 'donna:theme';

function browser(): boolean {
	return typeof document !== 'undefined';
}

function prefersDark(): boolean {
	return browser() && typeof matchMedia !== 'undefined'
		? matchMedia('(prefers-color-scheme: dark)').matches
		: false;
}

/** Resolve the effective theme: explicit choice if stored, otherwise the OS preference. */
function resolveInitial(): boolean {
	if (typeof localStorage === 'undefined') return false;
	const stored = localStorage.getItem(THEME_KEY);
	if (stored === 'dark') return true;
	if (stored === 'light') return false;
	return prefersDark();
}

function apply(dark: boolean): void {
	if (browser()) document.documentElement.classList.toggle('dark', dark);
}

class ThemeStore {
	#dark = $state(resolveInitial());

	get isDark(): boolean {
		return this.#dark;
	}

	set(dark: boolean): void {
		this.#dark = dark;
		apply(dark);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
	}

	toggle(): void {
		this.set(!this.#dark);
	}
}

export const theme = new ThemeStore();
