import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// Read-only: this page can reassign deployment-wide model routing, so the e2e
// only verifies it renders the live backend's categories/backings/local models.
// The reassign round-trip (PATCH body + fallback preservation + 403) is unit-tested.
test('settings → models: renders inference categories with their backings + local models', async ({
	page
}) => {
	await login(page);

	await page.goto('/settings/models');
	await expect(page.getByRole('heading', { name: 'Models', level: 1 })).toBeVisible();

	// The "Inference categories" card lists the standard chat aliases with a backing caption.
	await expect(page.getByRole('heading', { name: /inference categories/i })).toBeVisible();
	await expect(page.getByText('smart')).toBeVisible();
	await expect(page.getByText(/Backed by/).first()).toBeVisible();

	// Dev fixture is an admin → each category exposes a model select.
	await expect(page.getByRole('combobox', { name: /model for smart/i })).toBeVisible();

	// The installed-local-models card renders (list or empty state).
	await expect(page.getByRole('heading', { name: /installed local models/i })).toBeVisible();

	// The provider-keys card replaced the env note (details covered in byok-provider-keys.spec.ts).
	await expect(page.getByRole('heading', { name: /provider keys/i })).toBeVisible();
});
