import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

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

test('matter docs surface — upload + list + remove a file, edit context, link/unlink a KB', async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token();

  // Seed: a fresh matter + a fresh KB (the KB is the only "other KB to link" so the picker shows it).
  const unique = `E2E Docs ${Date.now()}`;
  const pid = (await api(tok, '/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: unique }) }).then((r) => r.json())).id as string;
  const kbName = `E2E KB ${Date.now()}`;
  const kid = (await api(tok, '/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: kbName }) }).then((r) => r.json())).id as string;

  try {
    await login(page);
    await page.goto(`/matters/${pid}`);

    // All four section headings render.
    await expect(page.getByRole('heading', { name: /files/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /knowledge/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /skills/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /context/i })).toBeVisible();

    // Files: empty state shows the Dropzone.
    await expect(page.getByRole('button', { name: /upload files/i })).toBeVisible();

    // Upload spike.pdf via the hidden file input (which carries name="file").
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /upload files/i }).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(PDF);

    // After the form submits + SvelteKit reloads, the row appears.
    await expect(page.getByText(/spike\.pdf/i)).toBeVisible({ timeout: 30000 });

    // Remove the file: the Dropzone returns.
    await page.getByRole('button', { name: /remove spike\.pdf/i }).click();
    await expect(page.getByRole('button', { name: /upload files/i })).toBeVisible({ timeout: 15000 });

    // Edit + save context_md.
    const ctx = page.getByRole('textbox', { name: /matter context/i });
    await ctx.fill('# Matter notes\n- thing');
    const save = page.getByRole('button', { name: /save context/i });
    await save.click();
    // use:enhance fires the POST asynchronously; wait for it to land before
    // reloading. On success the action's invalidate refreshes data.matter,
    // which makes `initial` match `value` again → dirty=false → Save disables.
    // That's the earliest deterministic signal that the save is durable.
    await expect(save).toBeDisabled({ timeout: 15000 });
    // After a full page reload, the textarea retains the value.
    await page.reload();
    await expect(page.getByRole('textbox', { name: /matter context/i })).toHaveValue('# Matter notes\n- thing');

    // Link the seeded KB.
    await page.getByRole('button', { name: /link a knowledge base/i }).click();
    await page.getByText(kbName, { exact: true }).click();
    await expect(page.getByText(kbName, { exact: true })).toBeVisible({ timeout: 15000 });

    // Unlink it.
    await page.getByRole('button', { name: new RegExp(`unlink ${kbName}`, 'i') }).click();
    await expect(page.getByText(kbName, { exact: true })).toHaveCount(0, { timeout: 15000 });
  } finally {
    // Unconditional cleanup.
    await api(tok, `/projects/${pid}`, { method: 'DELETE' });
    await api(tok, `/knowledge-bases/${kid}`, { method: 'DELETE' });
  }
});
