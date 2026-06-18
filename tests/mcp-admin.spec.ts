import { test, expect, type Page } from '@playwright/test';

// Live e2e for the MCP admin surface (Slice B). The admin page render is asserted
// unconditionally; the servers list + tool-toggle flow is gated on at least one
// MCP server being declared in the stack's mcp.yaml (mirrors research's CL gating).
// Read-only: any toggle is reverted in the same run.

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('mcp settings: admin sees the page; servers list when configured', async ({ page }) => {
	await login(page); // the e2e fixture account is an admin
	await page.goto('/settings/mcp');
	await expect(page.getByRole('heading', { name: /mcp tools/i })).toBeVisible();

	// Either servers are configured (cards with a Refresh button) or the empty state shows.
	const hasServers = await page
		.getByRole('button', { name: 'Refresh' })
		.first()
		.isVisible()
		.catch(() => false);
	if (!hasServers) {
		await expect(page.getByText(/no mcp servers configured/i)).toBeVisible();
		test.skip(true, 'No MCP server in mcp.yaml — empty state asserted, toggle flow skipped');
		return;
	}

	// Toggle the first tool, confirm the control flips, then revert it (self-clean).
	const firstToggle = page.locator('button[aria-pressed]').first();
	const before = await firstToggle.getAttribute('aria-pressed');
	await firstToggle.click();
	await expect(page.locator('button[aria-pressed]').first()).not.toHaveAttribute(
		'aria-pressed',
		before ?? ''
	);
	await page.locator('button[aria-pressed]').first().click(); // revert
});
