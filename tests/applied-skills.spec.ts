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

test('applied-skills confirmation appears on the assistant turn and persists across navigation', async ({
	page
}) => {
	await login(page);

	// Start a chat from the landing composer (first turn has no skill attached).
	await page.fill('textarea', 'In one short sentence, what is plain-language legal writing?');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	const chatUrl = page.url();
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

	// Attach comms-improver in the in-chat composer.
	await page.getByTestId('skill-attach').click();
	await page.getByTestId('skill-search').fill('comms');
	await expect(page.getByTestId('skill-result-comms-improver')).toBeVisible({ timeout: 10000 });
	await page.getByTestId('skill-result-comms-improver').click();

	// Send a second message that applies the skill.
	await page.fill('textarea', 'Rewrite this for a 10-year-old: pursuant to the foregoing.');
	await page.keyboard.press('Enter');

	// The new assistant turn shows the applied-skills confirmation: a link named
	// "Comms Improver" pointing at /skills, next to an "Applied:" label.
	const appliedLink = page.getByRole('link', { name: 'Comms Improver' });
	await expect(appliedLink).toBeVisible({ timeout: 30000 });
	await expect(appliedLink).toHaveAttribute('href', '/skills');
	await expect(page.getByText('Applied:').last()).toBeVisible();

	// Persists from history: a fresh server-side load of the same chat (full
	// navigation, not page.reload() — avoids the SvelteKit-2/Svelte-5 stale-data
	// reload quirk) still renders the confirmation.
	await page.goto('/');
	await page.goto(chatUrl);
	await expect(page.getByRole('link', { name: 'Comms Improver' })).toBeVisible({ timeout: 30000 });
	await expect(page.getByRole('link', { name: 'Comms Improver' })).toHaveAttribute(
		'href',
		'/skills'
	);
});
