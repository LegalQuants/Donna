import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
  return (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }).then((r) => r.json())).access_token;
}
async function api(tok: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${tok}`, ...(init.headers || {}) } });
}
async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('privileged matter shows the chip on list + detail + chat header and disables sub-floor models', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/matters');

  const unique = `E2E Privileged ${Date.now()}`;

  // Create a privileged matter with tier 4 via the UI form.
  await page.getByRole('button', { name: /new matter/i }).click();
  await page.getByLabel(/matter name/i).fill(unique);
  await page.getByLabel(/privileged matter/i).check();
  // Coupling: submit is disabled until a tier is selected.
  await expect(page.getByRole('button', { name: 'Create matter' })).toBeDisabled();
  await page.getByLabel(/minimum model tier/i).selectOption('4');
  await page.getByRole('button', { name: 'Create matter' }).click();

  // Detail page: heading + Privileged chip.
  await expect(page.getByRole('heading', { name: unique })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Privileged matter')).toBeVisible();

  // List page: privileged row carries the chip too.
  await page.goto('/matters');
  const row = page.getByRole('link', { name: new RegExp(unique) });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByLabel('Privileged matter')).toBeVisible();

  // Open the matter, start a chat in it.
  await row.click();
  await page.getByRole('button', { name: /new chat in this matter/i }).click();
  await page.waitForURL(/\/chats\//);

  // Chat header carries both the matter badge link AND the Privileged chip.
  await expect(page.getByRole('link', { name: unique })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Privileged matter')).toBeVisible();

  // ModelPicker shows the floor note and local models are disabled.
  await page.getByTestId('model-picker').click();
  await expect(page.getByText(/tier ≥ 4/)).toBeVisible();
  await expect(page.getByTestId('model-option-local')).toBeDisabled();
  // Cloud aliases (tier 4) remain enabled at floor 4.
  await expect(page.getByTestId('model-option-smart')).not.toBeDisabled();

  // Cleanup: archive the seeded matter.
  const tok = await token();
  // Detail URL is /matters/<id>; pull the id off the matter-badge link href.
  const projectHref = await page.getByRole('link', { name: unique }).first().getAttribute('href');
  const projectId = projectHref?.split('/').pop();
  if (projectId) await api(tok, `/projects/${projectId}`, { method: 'DELETE' });
});
