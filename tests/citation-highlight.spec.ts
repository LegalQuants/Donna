import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

async function api(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}

async function seedCitedChat(): Promise<string> {
  const tok = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  }).then((r) => r.json()).then((d) => d.access_token);

  const pid = await api(tok, '/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E Highlight Matter' }) }).then((r) => r.json()).then((d) => d.id);
  const kid = await api(tok, '/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E Highlight KB' }) }).then((r) => r.json()).then((d) => d.id);
  await api(tok, `/projects/${pid}/knowledge-bases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: kid }) });

  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
  const fid = await api(tok, '/files', { method: 'POST', body: fd }).then((r) => r.json()).then((d) => d.id);

  for (let i = 0; i < 60; i++) {
    const st = await api(tok, `/files/${fid}`).then((r) => r.json()).then((d) => d.ingestion_status);
    if (st === 'ready') break;
    if (st === 'failed') throw new Error('ingestion failed');
    await new Promise((r) => setTimeout(r, 2000));
  }
  await api(tok, `/knowledge-bases/${kid}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fid }) });

  for (let i = 0; i < 60; i++) {
    const res = await api(tok, `/knowledge-bases/${kid}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 }) }).then((r) => r.json());
    if ((res.results ?? []).length > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const cid = await api(tok, '/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'E2E highlight chat', project_id: pid }) }).then((r) => r.json()).then((d) => d.id);
  const q = 'What is the termination-for-convenience notice period? Quote the operative clause.';
  await api(tok, `/chats/${cid}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: q, model: 'smart', stream: false }) });
  return cid;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('hovering a citation shows metadata; clicking highlights the cited span', async ({ page }) => {
  test.setTimeout(180_000);
  const cid = await seedCitedChat();
  await login(page);
  await page.goto(`/chats/${cid}`);
  await page.waitForLoadState('networkidle');

  const pill = page.locator('.cite-tab').first();
  await expect(pill).toBeVisible({ timeout: 15000 });

  // Hover → metadata popover appears.
  await pill.hover();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

  // Click → panel opens, cited-passage bar appears, and a highlight is registered.
  await pill.click();
  const panel = page.getByRole('complementary', { name: /document panel/i });
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText(/Jump to ¶|cited passage on this page/i)).toBeVisible({ timeout: 15000 });

  // The CSS Custom Highlight 'cite' has at least one range (found state).
  await expect
    .poll(async () => page.evaluate(() => (globalThis.CSS?.highlights?.get('cite') as { size?: number } | undefined)?.size ?? 0), { timeout: 15000 })
    .toBeGreaterThan(0);
});
