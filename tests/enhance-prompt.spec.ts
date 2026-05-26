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

test('enhance rewrites the draft via a preview the user accepts, and records the outcome', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  // Start a chat (enhance is in-chat only).
  await page.fill('textarea', 'In one short sentence, what is an NDA?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

  // Type a short, vague draft and enhance it.
  await page.fill('textarea', 'review this nda');
  await page.getByTestId('enhance-button').click();

  // The ~20s call returns a preview card with the expanded prompt.
  await expect(page.getByTestId('enhance-expanded')).toContainText(/in-house counsel/i, { timeout: 45000 });

  // Accept → the expanded prompt lands in the textarea, and a PATCH outcome is recorded.
  const patchPromise = page.waitForRequest(
    (r: any) => r.url().includes('/enhance-prompt/') && r.method() === 'PATCH'
  );
  await page.getByTestId('enhance-accept').click();
  await patchPromise;
  await expect(page.locator('textarea')).toHaveValue(/in-house counsel/i);
});

test('the landing composer has no enhance affordance', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.getByTestId('enhance-button')).toHaveCount(0);
});
