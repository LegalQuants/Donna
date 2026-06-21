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

test('about guide has Research and Tools & connections pages', async ({ page }) => {
	await login(page);
	await page.goto('/about/research');
	await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible();
	await expect(page.getByText(/CourtListener/i).first()).toBeVisible();
	await page.goto('/about/tools');
	await expect(page.getByRole('heading', { level: 1, name: /Tools & connections/i })).toBeVisible();
	await expect(page.getByText(/Approve/i).first()).toBeVisible();
	// the About rail links both (scope to the About nav — the app sidebar also has a "Research" link)
	const aboutNav = page.getByRole('navigation', { name: 'About sections' });
	await expect(aboutNav.getByRole('link', { name: 'Research' })).toBeVisible();
	await expect(aboutNav.getByRole('link', { name: 'Tools & connections' })).toBeVisible();
});

test('research starters run a real search', async ({ page }) => {
	await login(page);
	await page.goto('/research');
	const chip = page.getByRole('button', { name: 'Chevron deference' });
	await expect(chip).toBeVisible({ timeout: 10000 });
	await chip.click();
	// the query box is filled and results populate
	await expect(page.getByRole('searchbox', { name: /search case law/i })).toHaveValue(
		'Chevron deference'
	);
	// pre-search the heading is just "Results"; after a search it gains a "(N)" count
	await expect(page.getByText(/Results\s*\(\d/i)).toBeVisible({ timeout: 30000 });
});

test('landing composer offers an example case-law prompt', async ({ page }) => {
	await login(page);
	const starter = page.getByRole('button', {
		name: /landmark U\.S\. Supreme Court case on free speech/i
	});
	await expect(starter).toBeVisible();
	await starter.click();
	await expect(page.locator('textarea')).toHaveValue(
		/landmark U\.S\. Supreme Court case on free speech/i
	);
});
