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

// The seeded admin's display_name is "LQ.AI Administrator"; Donna fronts the
// lq-ai backend, so the UI rebrands the LQ.AI token to "Donna" at render time.
test('user display name is rebranded LQ.AI → Donna in the UI', async ({ page }) => {
	await login(page);

	// Home greeting.
	await expect(
		page.getByRole('heading', { level: 1, name: /^Hi, Donna Administrator$/ })
	).toBeVisible();
	await expect(page.getByText(/LQ\.AI/)).toHaveCount(0);

	// Settings → Account profile name.
	await page.goto('/settings/account');
	const nameCell = page.locator('dt:has-text("Name") + dd');
	await expect(nameCell).toHaveText('Donna Administrator');

	// Email is a real credential — it is NOT rebranded.
	await expect(page.locator('dt:has-text("Email") + dd')).toHaveText('admin@lq.ai');
});
