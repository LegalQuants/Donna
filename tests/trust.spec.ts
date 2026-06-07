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

test('Trust — discloses the model matrix + tier policy', async ({ page }) => {
	test.setTimeout(60_000);
	await login(page);
	await page.goto('/settings/trust');

	await expect(page.getByRole('heading', { level: 1, name: 'Trust' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Trust' })).toHaveAttribute('aria-current', 'page');

	// Matrix: at least one row stating Local or Cloud.
	await expect(page.getByRole('table')).toBeVisible();
	await expect(page.getByRole('cell', { name: /Local|Cloud/ }).first()).toBeVisible();

	// Tier policy: the privileged-matter minimum is disclosed.
	await expect(page.getByText(/Privileged matters — minimum tier/i)).toBeVisible();

	// Anonymization callout.
	await expect(page.getByText(/anonymization layer/i)).toBeVisible();
});
