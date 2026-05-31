import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('save a prompt from the composer, insert it, then manage it', async ({ page }) => {
  test.setTimeout(90_000);
  const name = `E2E Prompt ${Date.now()}`;
  const body = 'Review this contract for indemnity risk.';

  await login(page);

  // The composer textarea is identified by its placeholder; using textbox.first()
  // is fragile because other pickers render search inputs.
  const composer = page.getByPlaceholder(/ask a question/i);

  // 1. Save the current draft as a prompt from the landing composer.
  await composer.fill(body);
  await page.getByRole('button', { name: /^prompts$/i }).click();
  await page.getByRole('button', { name: /save current draft/i }).click();
  await page.getByPlaceholder(/name this prompt/i).fill(name);
  // The POST to /prompts/items persists the prompt; wait for it before continuing.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/prompts/items') && r.request().method() === 'POST' && r.ok()
    ),
    page.getByRole('button', { name: /^save$/i }).click()
  ]);

  // 2. It now appears in the popover list; clear the box and insert it.
  // The save leaves the popover open. Click into the composer to dismiss it
  // (outside mousedown closes the popover), clear the draft, then reopen the
  // picker cleanly so the toggle deterministically opens it.
  await composer.click();
  await composer.fill('');
  const picker = page.getByRole('button', { name: /^prompts$/i });
  const insertBtn = page.getByRole('button', { name: new RegExp(`insert ${name}`, 'i') });
  await expect(async () => {
    await picker.click();
    await expect(insertBtn).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await insertBtn.click();
  await expect(composer).toHaveValue(/indemnity risk/);

  // 3. Manage it: it shows on /prompts; rename via Edit, then delete.
  await page.goto('/prompts');
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole('button', { name: /^edit$/i }).first().click();
  const renamed = `${name} v2`;
  await page.getByLabel(/name/i).fill(renamed);
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(renamed)).toBeVisible();

  await page.getByRole('button', { name: /^delete$/i }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^delete$/i }).click();
  await expect(page.getByText(renamed)).toHaveCount(0);
});
