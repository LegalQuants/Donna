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

test('the fiduciary guide page explains the four states and its playground is interactive', async ({
	page
}) => {
	await login(page);

	// Rail link → page.
	await page.goto('/about/overview');
	await page.getByRole('link', { name: 'Fiduciary receipts' }).click();
	await page.waitForURL('**/about/fiduciary');
	await expect(page.getByRole('heading', { name: 'Fiduciary receipts', level: 1 })).toBeVisible();

	// The four state labels are present in the prose.
	for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
		await expect(page.getByText(new RegExp(label)).first()).toBeVisible();

	// The embedded playground is interactive: drive its controls, watch the pill change.
	const frame = page.frameLocator('iframe[src="/learn/playgrounds/trust-states.html"]');
	await expect(frame.locator('#pill-label')).toHaveText('Fiduciary-grade'); // default
	await frame.getByText('Backed in substance').click();
	await expect(frame.locator('#pill-label')).toHaveText('Supported');
	// Honesty rule: fiduciary_grade + no sourced claims → No sourced claims (never green).
	await frame.getByText('Every quoted claim matched its source').click();
	await frame.getByText('This answer made sourced claims').click(); // uncheck
	await expect(frame.locator('#pill-label')).toHaveText('No sourced claims');
});
