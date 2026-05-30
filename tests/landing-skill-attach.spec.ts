import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
  return (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }).then((r) => r.json())
  ).access_token;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('attach a skill on the landing composer: slug reaches the first chat message POST', async ({ page }) => {
  test.setTimeout(120_000);

  let chatId: string | null = null;
  const tok = await token();

  try {
    await login(page);
    await page.goto('/');

    // --- open the ⊕ Skill popover on the landing composer ---
    await page.getByTestId('skill-attach').click();

    // Wait for results to load (the popover fires onopen → /skills/autocomplete)
    const firstResult = page.locator('[data-testid^="skill-result-"]').first();
    await expect(firstResult).toBeVisible({ timeout: 10_000 });

    // Capture the slug from the data-testid attribute and the title from its text
    const firstTestId = await firstResult.getAttribute('data-testid');
    const attachedSlug = firstTestId!.replace('skill-result-', '');
    const attachedTitle = await firstResult.locator('span.font-medium').textContent();

    // Click the first skill to attach it
    await firstResult.click();

    // The popover closes and a chip appears in the composer
    const chip = page.locator(`span:has-text("${attachedTitle}")`).first();
    await expect(chip).toBeVisible({ timeout: 5_000 });

    // --- fill the composer textarea ---
    const question = `What is an NDA? (e2e ${Date.now()})`;
    await page.locator('textarea').fill(question);

    // --- intercept the first message POST from the chat page ---
    // The ?/start form will create a chat and redirect; the chat page's onMount
    // fires chat.send() which POSTs to /chats/<id>/messages.
    const reqP = page.waitForRequest(
      (req) => req.url().includes('/messages') && req.method() === 'POST'
    );

    // Submit — the landing form posts to ?/start and redirects to the new chat
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // Wait for the redirect to the chat page
    await page.waitForURL(/\/chats\/[0-9a-f-]+/i, { timeout: 30_000 });

    // Capture chat id for cleanup
    const match = page.url().match(/\/chats\/([0-9a-f-]+)/i);
    chatId = match ? match[1] : null;

    // --- assert the POST body carries the skill ---
    const req = await reqP;
    const body = JSON.parse(req.postData() ?? '{}') as { content?: string; model?: string; skills?: string[] };
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills!.length).toBeGreaterThan(0);
    expect(body.skills).toContain(attachedSlug);

    // --- assert the assistant reply streams in ---
    await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 60_000 });
  } finally {
    // Cleanup: delete the created chat via the lq-ai API
    if (chatId) {
      await fetch(`${API}/chats/${chatId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tok}` }
      }).catch(() => {});
    }
  }
});
