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

test('unified Workflows area: hub, sub-nav switching, sidebar consolidation', async ({ page }) => {
	await login(page);

	// Sidebar shows a single Workflows entry; the old standalone entries are gone.
	const sidebar = page.locator('aside');
	await expect(sidebar.locator('a[href="/workflows"]')).toBeVisible();
	await expect(sidebar.locator('a[href="/skills"]')).toHaveCount(0);
	await expect(sidebar.locator('a[href="/playbooks"]')).toHaveCount(0);
	await expect(sidebar.locator('a[href="/prompts"]')).toHaveCount(0);

	// Hub: heading + three cards.
	await sidebar.locator('a[href="/workflows"]').click();
	await page.waitForURL('**/workflows');
	await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
	const cards = page.getByTestId('workflows-cards');
	await expect(cards.getByRole('link', { name: /Skills/ })).toBeVisible();
	await expect(cards.getByRole('link', { name: /Playbooks/ })).toBeVisible();
	await expect(cards.getByRole('link', { name: /Prompts/ })).toBeVisible();

	// Sub-nav switching: each segment lands on its route and is marked active,
	// and the sidebar Workflows entry stays highlighted throughout.
	const subnav = page.getByRole('navigation', { name: 'Workflows sections' });
	for (const [label, path] of [
		['Skills', '/skills'],
		['Playbooks', '/playbooks'],
		['Prompts', '/prompts']
	] as const) {
		await subnav.getByRole('link', { name: label }).click();
		await page.waitForURL('**' + path);
		await expect(subnav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
		await expect(sidebar.locator('a[href="/workflows"]')).toHaveAttribute('aria-current', 'page');
	}
});
