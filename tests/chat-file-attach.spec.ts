import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

// The backend does not support plain-text ingestion (ingestion_error: unsupported_type).
// Use a tiny PDF instead, generated via cupsfilter from /etc/hosts.
function ensurePdfFixture(): string {
  const path = join(tmpdir(), 'donna-attach-fixture.pdf');
  if (!existsSync(path)) {
    execSync(`cupsfilter /etc/hosts > "${path}" 2>/dev/null`, { stdio: 'inherit' });
  }
  return path;
}

test('composer: attach a file, wait for ready, send, see the file indicator', async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = ensurePdfFixture();

  await login(page);
  await page.getByPlaceholder(/ask a question/i).fill('Summarize the attached file.');

  // Attach via the hidden file input behind the paperclip.
  await page.getByTestId('file-attach-input').setInputFiles(fixture);

  // Chip appears; Send stays disabled until the file ingests to ready.
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();
  await expect(page.getByText(/ready/i)).toBeVisible({ timeout: 120_000 });
  await expect(send).toBeEnabled();

  await send.click();
  await page.waitForURL(/\/chats\//, { timeout: 15_000 });
  await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 60_000 });
  // The completed turn echoes the attached file.
  await expect(page.getByTestId('applied-files')).toBeVisible({ timeout: 10_000 });
});
