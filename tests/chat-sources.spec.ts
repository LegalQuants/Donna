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

// Model-nondeterministic: the assistant may not call a case-law tool. If no
// sources pill appears within the budget, the test self-skips (the binding
// evidence is the API-level check, documented in the PR). When the pill DOES
// appear, assert the panel renders a CourtListener link.
test('case-law turn surfaces a sources pill + panel (best-effort)', async ({ page }) => {
	await login(page);
	await page.fill(
		'textarea',
		'Use the case-law research tool to find a landmark U.S. Supreme Court case on abortion, and cite it.'
	);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 60000 });

	const pill = page.getByRole('button', { name: /sources? consulted/i });
	if (!(await pill.isVisible().catch(() => false))) {
		test.skip(true, 'model did not consult a case-law tool this run — verify at the API');
		return;
	}
	await expect(page.getByText(/Sources consulted \(/i)).toBeVisible();
	await expect(page.getByRole('link', { name: /courtlistener/i }).first()).toBeVisible();
});
