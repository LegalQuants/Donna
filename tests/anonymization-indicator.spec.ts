// tests/anonymization-indicator.spec.ts
// Live positive: with the anonymization layer enabled, a streamed cloud turn (tier 3-5)
// has anonymization_applied=true, so chatStream's post-completion fetch sets the message's
// `anonymized` flag and the "Anonymized" badge renders. The negative (no badge when the
// layer didn't run) is covered deterministically in Message.svelte.test.ts.
// Stack prereq: anonymization.enabled: true in the gateway (it is, in this dev stack).
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

test('shows the Anonymized badge on a streamed turn when the anonymization layer ran', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await page.fill('textarea', 'Name one common contract clause in two words.');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  // Wait for the turn to finish (Copy appears once the assistant row is persisted); the
  // chat controller then fetches the inference receipt and sets `anonymized`.
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Anonymized/i).first()).toBeVisible({ timeout: 15000 });
});
