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
  await expect(page.getByText(/aren't editable here yet/i)).toBeVisible();

  // Change-password links to the existing flow.
  await expect(page.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/change-password');

  // Two-factor is Off for the dev admin fixture → no Disable button.
  await expect(page.getByText('Off')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable' })).toHaveCount(0);
});
