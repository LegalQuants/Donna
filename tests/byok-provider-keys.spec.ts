import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

// Read-only by design: setting/revoking a real key would mutate gateway.yaml
// (and replacing an env key permanently converts it to runtime-managed), which
// is not test-reversible. The write paths are unit-tested; this verifies the
// live read path + env-row affordances.
test('settings → models: provider-keys card renders live statuses (read-only)', async ({ page }) => {
  await login(page);
  await page.goto('/settings/models');

  const card = page.locator('section', { has: page.getByRole('heading', { name: /provider keys/i }) });
  await expect(card).toBeVisible();
  await expect(card.getByText(/never shown again after saving/i)).toBeVisible();

  // The dev gateway config has at least one provider; each row exposes a masked input.
  const inputs = card.locator('input[type="password"]');
  expect(await inputs.count()).toBeGreaterThan(0);

  // Dev stack keys come from .env → expect an env-sourced row; it must show the
  // env hints and NO revoke control. (Skip gracefully if this env has none.)
  const envRow = card.locator('div', { hasText: /Configured · environment/ }).first();
  if (await envRow.count()) {
    await expect(envRow.getByText(/managed by your deployment's environment/)).toBeVisible();
    await expect(envRow.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
    await expect(envRow.getByRole('button', { name: 'Replace key' })).toBeVisible();
  }
});
