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

test('browse playbooks: grouped index → detail with positions and expandable internals', async ({ page }) => {
  await login(page);

  // Sidebar entry exists, and the index lists the built-ins.
  await expect(page.locator('aside a[href="/workflows"]')).toBeVisible();
  await page.goto('/playbooks');
  await expect(page.getByRole('heading', { name: 'Playbooks', level: 1 })).toBeVisible();

  // The DPA — GDPR built-in is present; open it.
  const link = page.getByRole('link', { name: /DPA — GDPR/i });
  await expect(link).toBeVisible({ timeout: 10000 });
  await link.click();
  await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+/i);

  // Detail: heading, position count, a severity badge, and expandable internals.
  await expect(page.getByRole('heading', { name: /DPA — GDPR/i, level: 1 })).toBeVisible();
  await expect(page.getByText(/\d+ positions?/)).toBeVisible();
  await expect(page.getByText('Critical').first()).toBeVisible();
  const toggle = page.getByRole('button', { name: /show matching details/i }).first();
  await toggle.click();
  await expect(page.getByText(/Detection keywords|Fallback tiers/).first()).toBeVisible();
});
