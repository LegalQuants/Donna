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

test('settings → account: profile, password link, MFA status (dev fixture is MFA-off)', async ({ page }) => {
  await login(page);

  // Sidebar Settings entry → redirects to the Account section.
  await page.locator('aside a[href="/settings"]').click();
  await page.waitForURL('**/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

  // Profile shows the account email + the read-only note.
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByText(/email isn't editable/i)).toBeVisible();

  // Change-password links to the existing flow.
  await expect(page.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/change-password');

  // Two-factor is Off for the dev admin fixture → no Disable button.
  await expect(page.getByText('Off')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable' })).toHaveCount(0);

  // The Change link actually reaches the change-password form (authed users are
  // allowed onto /change-password; only /login bounces them home). Do NOT submit —
  // that would rotate the admin fixture's password.
  await page.getByRole('link', { name: 'Change' }).click();
  await page.waitForURL('**/change-password');
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
});

test('settings → account: edit display name round-trip (restores fixture)', async ({ page }) => {
  await login(page);
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

  // Capture the current name from the Edit input (this is the rebranded value we restore to).
  await page.getByRole('button', { name: 'Edit' }).click();
  const original = await page.getByRole('textbox', { name: /display name/i }).inputValue();

  try {
    const sentinel = 'Donna Admin E2E';
    await page.getByRole('textbox', { name: /display name/i }).fill(sentinel);
    await page.getByRole('button', { name: 'Save' }).click();
    // Read mode returns with the new name + the announced confirmation.
    // Scope to <dd> to avoid matching the nav header span that also shows the name.
    await expect(page.locator('dd').filter({ hasText: sentinel })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/name updated/i)).toBeVisible();
  } finally {
    // Restore the fixture name so the shared admin is left as found.
    await page.goto('/settings/account');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('textbox', { name: /display name/i }).fill(original);
    const saveBtn = page.getByRole('button', { name: 'Save' });
    if (await saveBtn.isEnabled()) await saveBtn.click();
    // Scope to the <dd> so we don't hit the nav header span that also contains the name.
    await expect(page.locator('dd').filter({ hasText: original })).toBeVisible({ timeout: 10_000 });
  }
});
