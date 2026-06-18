import { test, expect, type Page } from '@playwright/test';

// Live e2e for the case-law research workspace (Slice A). The gate/render path
// is asserted unconditionally; the full search→read flow is gated on the stack
// having CourtListener wired (COURTLISTENER_API_TOKEN + a gateway tool_provider).
// When CL isn't wired, the page shows the "not enabled" gate and the search flow
// self-skips — both are valid, honest states. Read-only: creates no server state.

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('research workspace renders (gate when off, search flow when CL is wired)', async ({
	page
}) => {
	await login(page);

	// The nav entry is present and routes to /research.
	await page.goto('/research');
	await expect(page.getByRole('heading', { name: /case-law research/i })).toBeVisible();

	const searchbox = page.getByRole('searchbox', { name: /search case law/i });
	const enabled = await searchbox.isVisible().catch(() => false);

	if (!enabled) {
		// CourtListener not wired in this stack — assert the honest gate and skip the flow.
		await expect(page.getByText(/isn’t enabled/i)).toBeVisible();
		test.skip(
			true,
			'CourtListener not wired (no token / tool_provider) — gate asserted, search flow skipped'
		);
		return;
	}

	// Enabled path: a real search returns results; clicking one loads its cluster,
	// and an opinion opens in the doc panel.
	await searchbox.fill('Chevron deference');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	// Results render — click the first one to load its cluster + opinion list.
	const resultsSection = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: /^Results/ }) });
	const firstResult = resultsSection.getByRole('button').first();
	await expect(firstResult).toBeVisible({ timeout: 20000 });
	await firstResult.click();

	// The cluster's opinion list renders an Open button → open it in the doc panel.
	const firstOpen = page.getByRole('button', { name: 'Open' }).first();
	await expect(firstOpen).toBeVisible({ timeout: 20000 });
	await firstOpen.click();

	// The doc panel mounts with the opinion plaintext.
	await expect(page.locator('pre')).toBeVisible({ timeout: 20000 });
});
