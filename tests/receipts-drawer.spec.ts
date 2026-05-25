import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const SEEDED_CHAT = process.env.DONNA_SEEDED_CHAT ?? '';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

async function newChatWithATurn(page: Page): Promise<void> {
  await page.fill('textarea', 'In one sentence, what is a force majeure clause?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });
}

// PAUSED pending lq-ai streaming inference-routing-log fix (see
// docs/upstream-requests/lq-ai-streaming-inference-routing-log.md). Streamed turns
// (the whole UI) don't persist an inference_routing_log row, so the drawer's inference
// row is empty for UI-created chats. Un-skip + finalize once the gateway fix lands
// (then this can seed a chat and assert the inference row).
test.skip('Receipts drawer opens and shows the provenance timeline', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  if (SEEDED_CHAT) await page.goto(`/chats/${SEEDED_CHAT}`);
  else await newChatWithATurn(page);

  await page.getByRole('button', { name: /receipts/i }).click();
  const drawer = page.getByRole('dialog', { name: /receipts/i });
  await expect(drawer).toBeVisible();

  // At least an inference row renders (real events). Tier badge proves the inference row.
  await expect(drawer.getByText(/tier \d/i).first()).toBeVisible({ timeout: 15000 });
  await expect(drawer.getByRole('link', { name: /export/i })).toHaveAttribute('href', /receipts\/export\.jsonl$/);

  // A filter chip narrows the list (toggle "inference" off → its tier text disappears).
  const before = await drawer.locator('text=/tier \\d/i').count();
  await drawer.getByRole('button', { name: /^inference$/i }).click();
  await expect(drawer.locator('text=/tier \\d/i')).toHaveCount(0);
  expect(before).toBeGreaterThan(0);

  // Esc closes.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /receipts/i })).toHaveCount(0);
});
