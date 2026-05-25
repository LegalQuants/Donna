import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  // Wait for the post-login redirect to the landing before continuing, so
  // session cookies are set and the shell has rendered.
  await page.waitForURL('/');
}

test('rejects invalid credentials with an inline error', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', 'definitely-wrong');
  await page.click('button:has-text("Sign in")');
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test('logs in and lands on the assistant greeting', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /^Hi, / })).toBeVisible();
  await expect(page.getByText(/answers are not legal advice/i)).toBeVisible();
});

test('access token cookie is httpOnly and not readable from JS', async ({ page, context }) => {
  await login(page);
  const cookies = await context.cookies();
  const at = cookies.find((c) => c.name === 'donna_at');
  expect(at?.httpOnly).toBe(true);
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain('donna_at');
});

test('submitting a first message creates a chat and routes to it', async ({ page }) => {
  await login(page);
  await page.fill('textarea', 'Review this NDA for unusual terms.');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByText('Review this NDA for unusual terms.')).toBeVisible();
});

test('sidebar collapse persists across reload', async ({ page }) => {
  await login(page);
  await page.click('button[aria-label="Toggle sidebar"]');
  await page.reload();
  await expect(page.locator('aside')).toHaveClass(/w-16/);
});
