import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// Click a segment and wait for the optimistic save to actually land server-side
// before navigating away (a bare goto() would cancel the in-flight PATCH).
async function setPref(page: Page, radioName: string) {
	const [resp] = await Promise.all([
		page.waitForResponse(
			(r) => r.url().includes('/settings/preferences') && r.request().method() === 'PATCH',
			{ timeout: 15000 }
		),
		page.getByRole('radio', { name: radioName }).click()
	]);
	expect(resp.ok()).toBeTruthy();
}

async function resetPrefs() {
	const tok = (
		await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		}).then((r) => r.json())
	).access_token;
	await fetch(`${API}/users/me/preferences`, {
		method: 'PATCH',
		headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
		body: JSON.stringify({ trust_pills: 'labels', provenance_pills: 'always' })
	});
}

test('Preferences — trust indicator + message details persist and apply', async ({ page }) => {
	test.setTimeout(120_000);
	// Deterministic starting state (a prior interrupted run may have left non-defaults).
	await resetPrefs();
	try {
		await login(page);
		await page.goto('/settings/preferences');
		await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
			'aria-current',
			'page'
		);

		// Composer trust pill starts in labels form on the home page (word text present).
		await page.goto('/');
		await expect(page.getByTestId('trust-pill')).toBeVisible();
		const labelText = (await page.getByTestId('trust-pill').textContent())?.trim() ?? '';
		expect(labelText.length).toBeGreaterThan(1); // has a word, not just the dot

		// Switch trust indicator → Dots (wait for the save to persist).
		await page.goto('/settings/preferences');
		await setPref(page, 'Dots');
		await expect(page.getByRole('radio', { name: 'Dots' })).toHaveAttribute('aria-checked', 'true');

		// Reload home → pill is now dot-only (no word text).
		await page.goto('/');
		await expect(page.getByTestId('trust-pill')).toBeVisible();
		expect(((await page.getByTestId('trust-pill').textContent()) ?? '').replace(/[●\s]/g, '')).toBe(
			''
		);

		// Switch message details → Collapsed; assert it persists across reload.
		await page.goto('/settings/preferences');
		await setPref(page, 'Collapsed');
		await expect(page.getByRole('radio', { name: 'Collapsed' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		await page.reload();
		await expect(page.getByRole('radio', { name: 'Collapsed' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	} finally {
		await resetPrefs();
	}
});
