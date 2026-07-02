import { test, expect, type Page } from '@playwright/test';

// Live e2e for the authoritative-sources registry card (Slice 0). Read-only:
// creates no server state. The card is always visible regardless of the
// CourtListener capability gate; it renders registered sources (unconfigured
// ones show as "Unavailable"), or an honest empty/error state — never blank.

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('authoritative-sources card renders on the research page', async ({ page }) => {
	await login(page);
	await page.goto('/research');

	// The card mounts (it does not depend on the CourtListener capability gate).
	const heading = page.getByRole('heading', { name: 'Authoritative sources' });
	await expect(heading).toBeVisible();

	// It is in a valid rendered state: either a source row with an availability
	// marker, or an honest empty/error line — proving the load + card work e2e.
	const card = page.locator('section').filter({ has: heading });
	await expect(
		card
			.getByText(
				/Available|Unavailable|No authoritative sources are registered|Could not load source availability/
			)
			.first()
	).toBeVisible();
});
