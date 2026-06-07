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

test('model picker offers grouped aliases, sends the chosen model, and persists', async ({
	page
}) => {
	await login(page);

	// Start a chat from the landing composer (defaults to smart).
	await page.fill('textarea', 'In one short sentence, what is an NDA?');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

	// Open the picker: it lists the curated aliases (smart + fast at least).
	await page.getByTestId('model-picker').click();
	await expect(page.getByTestId('model-option-fast')).toBeVisible();
	await expect(page.getByTestId('model-option-smart')).toBeVisible();

	// Select fast, then send a second message; assert the outgoing body carries model=fast.
	await page.getByTestId('model-option-fast').click();
	await expect(page.getByTestId('model-picker')).toContainText('fast');

	const reqPromise = page.waitForRequest(
		(r: any) => r.url().includes('/messages') && r.method() === 'POST'
	);
	await page.fill('textarea', 'And what does it protect?');
	await page.keyboard.press('Enter');
	const req = await reqPromise;
	expect(JSON.parse(req.postData() || '{}').model).toBe('fast');

	// Selection persists across reload (localStorage).
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('model-picker')).toContainText('fast');
});

test('a model chosen on the landing composer applies to the first message', async ({ page }) => {
	await login(page);

	// Pick a non-default model on the LANDING composer, before any chat exists.
	await page.getByTestId('model-picker').click();
	await page.getByTestId('model-option-fast').click();
	await expect(page.getByTestId('model-picker')).toContainText('fast');

	// Sending the first message creates the chat; the auto-sent draft must carry fast.
	const reqPromise = page.waitForRequest(
		(r: any) => r.url().includes('/messages') && r.method() === 'POST'
	);
	await page.fill('textarea', 'In one short sentence, what is an NDA?');
	await page.keyboard.press('Enter');
	const req = await reqPromise;
	expect(JSON.parse(req.postData() || '{}').model).toBe('fast');
});
