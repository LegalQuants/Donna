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

test('Data & privacy — export end-to-end, delete-confirm UI (no submit), not-pending state', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  // Reach the page via the settings rail.
  await page.goto('/settings/data');
  await expect(page.getByRole('heading', { level: 1, name: 'Data & privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute('aria-current', 'page');

  // --- Export end-to-end (real ingest-worker builds the ZIP) ---
  await page.getByRole('button', { name: /export my data/i }).click();
  await expect(page.getByText(/preparing your export/i)).toBeVisible({ timeout: 15_000 });
  const download = page.getByRole('link', { name: /download archive/i });
  await expect(download).toBeVisible({ timeout: 240_000 });
  await expect(download).toHaveAttribute('href', /.+/); // presigned URL present

  // --- Deletion confirm modal UI — gate, then CANCEL OUT (never submit) ---
  await page.getByRole('button', { name: /delete my account/i }).click();
  const dialog = page.getByRole('dialog', { name: /delete your account/i });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Delete account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/type delete to confirm/i).fill('DELETE');
  await expect(confirm).toBeEnabled();
  // Do NOT click confirm — closing the modal leaves the account untouched.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // --- Not-pending state (admin fixture has no pending deletion; never POST a real deletion) ---
  // The banner and its cancel control only exist when data.user.deletion_scheduled_at is non-null.
  await expect(page.getByText(/pending deletion/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /cancel scheduled deletion/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /delete my account/i })).toBeVisible();
});
