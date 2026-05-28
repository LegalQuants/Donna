import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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

test('create a matter, start a chat in it, and rename + archive', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/matters');

  const unique = `E2E Matter ${Date.now()}`;
  await page.getByRole('button', { name: /new matter/i }).click();
  await page.getByLabel(/matter name/i).fill(unique);
  await page.getByRole('button', { name: 'Create matter' }).click();

  // Lands on the new matter's detail page.
  await expect(page.getByRole('heading', { name: unique })).toBeVisible({ timeout: 15000 });

  // New chat in this matter → chat opens with the matter badge.
  await page.getByRole('button', { name: /new chat in this matter/i }).click();
  await page.waitForURL(/\/chats\//);
  await expect(page.getByRole('link', { name: unique })).toBeVisible({ timeout: 15000 }); // header badge links to the matter

  // Rename, then archive.
  await page.getByRole('link', { name: unique }).click(); // back to the matter
  await page.getByRole('button', { name: 'Rename' }).click();
  const renamed = `${unique} (renamed)`;
  await page.getByLabel(/matter name/i).fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Archive' }).click(); // opens the confirm modal
  await page.locator('form[action="?/archive"] button[type="submit"]').click(); // confirm
  await page.waitForURL('**/matters');
  await expect(page.getByRole('heading', { name: 'Matters' })).toBeVisible();
  await expect(page.getByText(renamed)).toHaveCount(0);
});

test('a matter with a KB lights up citations for a chat scoped via the landing picker', async ({ page }) => {
  test.setTimeout(240_000);
  const tok = await token();
  const matterName = `E2E Cited ${Date.now()}`;
  const pid = (await api(tok, '/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: matterName }) }).then((r) => r.json())).id;
  const kid = (await api(tok, '/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E KB' }) }).then((r) => r.json())).id;
  await api(tok, `/projects/${pid}/knowledge-bases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: kid }) });
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
  const fid = (await api(tok, '/files', { method: 'POST', body: fd }).then((r) => r.json())).id;
  for (let i = 0; i < 60; i++) { const st = (await api(tok, `/files/${fid}`).then((r) => r.json())).ingestion_status; if (st === 'ready') break; if (st === 'failed') throw new Error('ingestion failed'); if (i === 59) throw new Error('ingestion timed out'); await new Promise((r) => setTimeout(r, 2000)); }
  await api(tok, `/knowledge-bases/${kid}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fid }) });
  for (let i = 0; i < 60; i++) { const res = await api(tok, `/knowledge-bases/${kid}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 }) }).then((r) => r.json()); if ((res.results ?? []).length > 0) break; if (i === 59) throw new Error('retrieval timed out'); await new Promise((r) => setTimeout(r, 2000)); }

  await login(page);
  // Pick the seeded matter in the landing composer, then send a grounded question.
  await page.getByRole('button', { name: /choose matter/i }).click();
  await page.getByRole('button', { name: matterName, exact: true }).click();
  await page.locator('textarea').fill('What is the termination-for-convenience notice period? Quote the operative clause.');
  await page.locator('textarea').press('Enter');

  await page.waitForURL(/\/chats\//);
  // A citation pill appears → matter scoping lit up RAG for a normal UI chat.
  await expect(page.locator('.cite-tab').first()).toBeVisible({ timeout: 60000 });

  // Cleanup: archive the seeded matter so the picker list doesn't grow unbounded.
  await api(tok, `/projects/${pid}`, { method: 'DELETE' });
});
