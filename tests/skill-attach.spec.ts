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

test('attach a skill in a chat: chip appears, body carries skills, persists across sends', async ({ page }) => {
  await login(page);

  // Start a chat from the landing composer.
  await page.fill('textarea', 'In one short sentence, what is an NDA?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

  // Open the skill popover, search, and attach nda-review.
  await page.getByTestId('skill-attach').click();
  await page.getByTestId('skill-search').fill('nda');
  await expect(page.getByTestId('skill-result-nda-review')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('skill-result-nda-review').click();

  // Chip appears. Assert via its unique "Remove" control — the popover stays open
  // for multi-attach, so the skill title also still shows in the result list.
  const chipRemove = page.getByRole('button', { name: /remove nda review/i });
  await expect(chipRemove).toBeVisible();

  // Sending carries skills:["nda-review"] in the outgoing body.
  const reqPromise = page.waitForRequest(
    (r: any) => r.url().includes('/messages') && r.method() === 'POST'
  );
  await page.fill('textarea', 'Is the non-compete enforceable?');
  await page.keyboard.press('Enter');
  const req = await reqPromise;
  expect(JSON.parse(req.postData() || '{}').skills).toEqual(['nda-review']);

  // Sticky: the chip is still attached for a second message.
  await expect(page.getByRole('button', { name: /copy/i }).last()).toBeVisible({ timeout: 30000 });
  await expect(chipRemove).toBeVisible();
});

test('the landing composer offers skill-attach (apply a skill to the first message)', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.getByTestId('skill-attach')).toBeVisible();
});
