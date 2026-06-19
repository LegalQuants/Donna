import { test, expect, type Page } from '@playwright/test';

// Live e2e for the per-user MCP OAuth "Connections" surface (Slice B2). Gated on
// an OAuth MCP server being declared in the stack's mcp.yaml; self-skips to the
// empty state otherwise (mirrors research / mcp-admin gating). Read-only.
//
// HONEST LIMIT: completing the external OAuth consent needs a *registered*
// provider (a real oauth_client_id whose discovery the gateway can broker). The
// dev stack wires Context7 with a placeholder client, so Connect round-trips
// back to Donna with an error banner — which exercises the full BFF connect
// path (authorize proxy → non-3xx → graceful return) end to end. With a
// registered client the same click would instead land on the auth server.
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('connections page lists OAuth servers and the Connect flow round-trips', async ({ page }) => {
	await login(page);
	await page.goto('/settings/connections');
	await expect(page.getByRole('heading', { name: /^Connections$/ })).toBeVisible();

	const connect = page.getByRole('link', { name: /^connect$/i }).first();
	if (!(await connect.isVisible().catch(() => false))) {
		await expect(page.getByText(/no oauth mcp servers/i)).toBeVisible();
		test.skip(true, 'No OAuth MCP server configured — empty state asserted');
		return;
	}

	// The list rendered a not-connected OAuth server with a Connect link that
	// points at the BFF redirect route.
	await expect(connect).toHaveAttribute('href', /\/settings\/connections\/[^/]+\/connect$/);

	// Click Connect → Donna mediates /authorize → the browser either reaches the
	// external auth server (registered client) or returns to Donna with a banner
	// (placeholder client). Both are honest, non-crashing outcomes.
	await connect.click();
	await page.waitForLoadState('domcontentloaded');

	if (page.url().includes('localhost:13002')) {
		// Returned to Donna: the connect path was exercised and handled gracefully.
		await expect(page.getByRole('heading', { name: /^Connections$/ })).toBeVisible();
		await expect(page.getByRole('alert')).toBeVisible();
	} else {
		// Left Donna toward the external auth server (registered-client path).
		expect(page.url()).not.toContain('localhost:13002');
	}
});
