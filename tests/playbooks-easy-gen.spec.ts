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

test('generate a playbook from a document, prune, and save', async ({ page }) => {
  test.setTimeout(240_000); // real ingest + generation worker

  await login(page);
  await page.goto('/playbooks');
  await page.getByRole('button', { name: /new playbook/i }).click();
  await page.getByRole('link', { name: /generate from documents/i }).click();
  await expect(page).toHaveURL(/\/playbooks\/new/);

  await page.getByLabel(/contract type/i).fill('NDA');
  await page.getByTestId('dropzone-input').setInputFiles({
    name: 'nda-1-acme-beta.pdf',
    mimeType: 'application/pdf',
    buffer: readFileSync(NDA)
  });
  await expect(page.getByText(/1 selected/i)).toBeVisible();
  await page.getByRole('button', { name: /generate playbook/i }).click();

  // Review step: the draft name field + at least one position card.
  await expect(page.getByLabel(/playbook name/i)).toBeVisible({ timeout: 220_000 });
  // Prune one position (uncheck the first keep checkbox), then save.
  const firstKeep = page.getByRole('checkbox', { name: /^keep / }).first();
  await firstKeep.uncheck();
  await page.getByRole('button', { name: /save playbook/i }).click();

  // Lands on the saved playbook's detail page.
  await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
