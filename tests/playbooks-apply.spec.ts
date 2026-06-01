import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const NDA = 'vendor/lq-ai/docs/quickstart/sample-ndas/nda-1-acme-beta.pdf';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('apply a playbook to an uploaded document and see results with a redline', async ({ page }) => {
  test.setTimeout(120_000); // real ingest + 4-node LLM execution

  await login(page);

  // Open NDA — Mutual, click Apply (admin account).
  await page.goto('/playbooks');
  await page.getByRole('link', { name: /NDA — Mutual/i }).click();
  await page.getByRole('link', { name: /apply to a document/i }).click();
  await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+\/run/i);

  // Upload the sample NDA via the dropzone input.
  await page.getByTestId('dropzone-input').setInputFiles({
    name: 'nda-1-acme-beta.pdf',
    mimeType: 'application/pdf',
    buffer: readFileSync(NDA)
  });

  // Results render: the scorecard + at least one verdict card with a redline.
  await expect(page.getByText(/\d+ Standard/)).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText('Suggested redline').first()).toBeVisible();

  // Toggle to the consolidated Redlines view: the verdict cards' "Suggested redline"
  // label is gone, and the redline document shows at least one struck change.
  await page.getByRole('button', { name: 'Redlines' }).click();
  await expect(page.getByText('Suggested redline')).toHaveCount(0);
  await expect(page.locator('.line-through').first()).toBeVisible();

  // Toggle back restores the verdict cards.
  await page.getByRole('button', { name: 'Verdict cards' }).click();
  await expect(page.getByText('Suggested redline').first()).toBeVisible();
});
