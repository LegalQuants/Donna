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

// A real autonomous run: run-now (cost-capped) → receipt → wait terminal →
// the Results section shows the work-product (findings or the recorded-none state).
test('run-now → receipt shows the Results section after the run completes', async ({ page }) => {
  test.setTimeout(420_000); // a real run takes minutes (intake→…→notify on arq-worker)
  await login(page);

  await page.goto('/automations/new');
  // Source: flat searchable list — pick a built-in playbook.
  await page.getByRole('button', { name: /DPA — GDPR/ }).click();
  // KB (required): dropdown trigger → search → option (substring is safe pre-selection).
  await page.getByRole('button', { name: 'Choose a knowledge base' }).click();
  await page.getByPlaceholder(/search/i).last().fill('Adopt');
  await page.getByRole('button', { name: /Adopt a Pupper/ }).last().click();
  await page.getByLabel(/cost cap/i).fill('1.00');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // Redirects to the live receipt.
  await page.waitForURL(/\/automations\/[0-9a-f-]+$/, { timeout: 20_000 });

  // Results section exists immediately (running state).
  const results = page.getByRole('region', { name: 'Results' });
  await expect(results).toBeVisible();

  // Wait for the run to reach terminal (the live-updating line disappears).
  await expect(page.getByText('Running — live updating…')).toBeHidden({ timeout: 360_000 });

  // Terminal: Results shows findings (severity summary + badge cards — "other"
  // covers free-text severities) or the recorded-none state.
  const hasFindings = await results.locator('text=/critical|warn|info|other/').first().isVisible().catch(() => false);
  if (!hasFindings) {
    await expect(results.getByText('This run recorded no findings.')).toBeVisible();
  }
  // Typical run-now proposes no memories — the sub-section stays absent.
  // (Populated rendering is unit-tested; tolerate its presence if the model did propose some.)
});
