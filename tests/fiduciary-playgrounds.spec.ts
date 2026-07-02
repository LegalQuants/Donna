import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

const SLUGS = [
	'authority-sources',
	'citation-ledger',
	'fiduciary-gate',
	'treatment-layer',
	'matter-session-flow'
];

test('the 5 fiduciary playgrounds are wired on /about/fiduciary and load', async ({ page }) => {
	await login(page);
	await page.goto('/about/fiduciary');
	for (const s of SLUGS)
		await expect(page.locator(`a[href="/learn/playgrounds/${s}.html"]`).first()).toBeVisible();

	// The vendored playground itself is served and loads.
	const resp = await page.goto('/learn/playgrounds/citation-ledger.html');
	expect(resp?.ok()).toBeTruthy();
	await expect(page.getByRole('link', { name: /Learn/ }).first()).toBeVisible();
});
