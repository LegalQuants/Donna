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

test('streams an assistant reply with a resolved tier, and it persists on reload', async ({
	page
}) => {
	await login(page);
	const question = 'In one short sentence, what is an NDA?';
	await page.fill('textarea', question);
	await page.keyboard.press('Enter');

	// Routed into a chat
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);

	// Assistant content streams in (prose contains real words); tier chip resolves to a number.
	await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 30000 });
	await expect(page.getByText(/Tier \d/)).toBeVisible({ timeout: 30000 });

	// Wait until the answer is fully complete (Copy appears once the `complete` frame
	// lands and the assistant row is persisted), then let the DB write settle.
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });
	await page.waitForTimeout(1000);

	// Persists across reload (history load path): the question and a non-empty answer come back.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(question)).toBeVisible({ timeout: 15000 });
	await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 15000 });
});

test('Stop appears while streaming and halts the response', async ({ page }) => {
	await login(page);
	await page.goto('/');
	await page.fill(
		'textarea',
		'List ten common contract clauses, each with a two-sentence explanation.'
	);
	await page.keyboard.press('Enter');

	// While streaming, the composer shows a Stop control.
	const stop = page.getByRole('button', { name: /stop/i });
	await expect(stop).toBeVisible({ timeout: 30000 });
	await stop.click();

	// Aborting returns the composer to Send mode without crashing.
	await expect(page.getByRole('button', { name: /send/i })).toBeVisible({ timeout: 10000 });
});
