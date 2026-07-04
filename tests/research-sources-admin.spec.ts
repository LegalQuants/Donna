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

test('admin enables then disables a keyless authority source (EDGAR)', async ({ page }) => {
	await login(page);
	await page.goto('/settings/research');

	// The EDGAR row is present; enable it (keyless → Enable button).
	const edgarRow = page.locator('li', { hasText: /SEC EDGAR/ });
	await expect(edgarRow).toBeVisible();

	try {
		if (await edgarRow.getByRole('button', { name: /^Enable$/ }).count()) {
			await edgarRow.getByRole('button', { name: /^Enable$/ }).click();
		}
		// After the form action + reload, EDGAR shows Available + a Disable control.
		await expect(edgarRow.getByText('Available')).toBeVisible({ timeout: 15000 });
		await expect(edgarRow.getByRole('button', { name: /disable/i })).toBeVisible();
	} finally {
		// Teardown: disable via the UI if still enabled.
		await page.goto('/settings/research');
		const row = page.locator('li', { hasText: /SEC EDGAR/ });
		if (await row.getByRole('button', { name: /disable/i }).count()) {
			await row.getByRole('button', { name: /disable/i }).click();
			await expect(row.getByText('Unavailable')).toBeVisible({ timeout: 15000 });
		}
	}
});
