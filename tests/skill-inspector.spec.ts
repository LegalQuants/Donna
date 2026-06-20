import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('built-in skill inspector shows the case-law tool-usage note', async ({ page }) => {
	await login(page);
	await page.goto('/skills/view/case-law-research');
	// The inspector renders its own page header (the markdown body also begins with
	// an `# …` h1, so scope to the inspector's title element via .first()).
	await expect(
		page.getByRole('heading', { level: 1, name: /case-law research/i }).first()
	).toBeVisible({ timeout: 15000 });
	// The C5 tool-usage note names the courtlistener connector.
	await expect(page.getByText(/Uses:\s*courtlistener/i)).toBeVisible();
});

test('the skills list links a built-in skill to its inspector', async ({ page }) => {
	await login(page);
	await page.goto('/skills');
	await page.getByLabel('Search built-in skills').fill('case-law');
	// Target the inspector link by href: a default `name: 'View'` match is a
	// case-insensitive SUBSTRING, so it would also catch any user skill whose
	// name contains "review".
	const view = page.locator('a[href="/skills/view/case-law-research"]');
	await expect(view).toBeVisible({ timeout: 10000 });
	await view.click();
	await expect(page).toHaveURL(/\/skills\/view\/case-law-research$/);
});
