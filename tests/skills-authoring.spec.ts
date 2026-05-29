import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
  return (await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  }).then((r) => r.json())).access_token;
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

/** Archive a user skill by ID via the API — used in finally for cleanup. */
async function archiveSkillApi(tok: string, id: string) {
  await api(tok, `/user-skills/${id}`, { method: 'DELETE' }).catch(() => {});
}

test('skills authoring — create, edit, fork built-in, archive', async ({ page }) => {
  test.setTimeout(300_000);
  const tok = await token();

  const stamp = Date.now();
  const skillName = `E2E Skill ${stamp}`;
  // NOTE: the fork API uses new_name as the slug directly (no space→hyphen conversion),
  // so the name must be a valid slug (lowercase alphanumeric + hyphens, no spaces).
  // Using a slug-format name here works around the app bug where the ForkBrowser pre-fills
  // the "New name" field with the built-in skill's display title (which contains spaces),
  // causing a backend 422 validation error when the user submits without changing it.
  const forkName = `e2efork${stamp}`;
  const editedBody = `# E2E Body ${stamp}\n\nEdited during e2e test.`;
  const slashAlias = `/e2e${stamp}`;

  let createdSkillId: string | null = null;
  let forkedSkillId: string | null = null;

  // Determine whether built-in skills exist before running the fork sub-test.
  const builtins = await api(tok, '/skills?scope=builtin').then((r) => r.json() as Promise<Array<{ name: string; title: string }>>).catch(() => [] as Array<{ name: string; title: string }>);
  const hasBuiltins = Array.isArray(builtins) && builtins.length > 0;
  if (!hasBuiltins) {
    console.log('[skills-authoring] No built-in skills returned by /skills?scope=builtin — fork sub-test will be skipped.');
  } else {
    console.log(`[skills-authoring] ${builtins.length} built-in skill(s) available; fork sub-test will run (first: "${builtins[0].title}").`);
  }

  try {
    // --- 1. Login and navigate to /skills ---
    await login(page);
    await page.goto('/skills');
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible({ timeout: 10_000 });

    // --- 2. Create a new skill ---
    await page.getByRole('button', { name: /new skill/i }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create skill' });
    await expect(createDialog).toBeVisible({ timeout: 5_000 });

    // Fill Name; assert Slug auto-derives.
    await createDialog.getByLabel('Name').fill(skillName);
    // The slug is auto-derived (non-empty) once the name is typed.
    const slugInput = createDialog.getByLabel('Slug');
    await expect(slugInput).not.toHaveValue('', { timeout: 3_000 });

    // Fill Description — the live backend (lq-ai) requires description ≥ 1 char
    // (min_length constraint). The app does not surface this constraint in the UI;
    // leaving it empty triggers a backend 422 that is mistakenly shown as
    // "slash command already in use" — a known app bug. Providing a description
    // here reflects realistic user behaviour and avoids that false error.
    await createDialog.getByLabel('Description').fill(`E2E test skill created at ${stamp}`);

    // Replace the default Body (starter body) with our unique test body.
    // The body field is a textarea; use fill to replace.
    await createDialog.getByLabel('Body').fill(editedBody);

    // Submit — on success, server redirects to /skills/<uuid>.
    await createDialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/skills\/[0-9a-f-]+$/i, { timeout: 15_000 });

    // Capture the ID from the URL for cleanup.
    const skillUrl = page.url();
    const skillIdMatch = skillUrl.match(/\/skills\/([0-9a-f-]+)$/i);
    if (!skillIdMatch) throw new Error(`Unexpected URL after create: ${skillUrl}`);
    createdSkillId = skillIdMatch[1];

    // Assert the Name field holds the created value on the detail page.
    await expect(page.getByLabel('Name')).toHaveValue(skillName, { timeout: 5_000 });

    // --- 3. Edit: set slash command and change body, then Save ---
    await page.getByLabel('Slash command (optional)').fill(slashAlias);
    const updatedBody = `${editedBody}\n\n[edited]`;
    await page.getByLabel('Body').fill(updatedBody);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // Wait for save round-trip: the enhance callback invalidates + re-loads page data.
    // We wait for the network to settle rather than a fixed sleep.
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    // Navigate to /skills index via the breadcrumb "Skills" link (SPA nav).
    // The detail page has two "Skills" links: the sidebar nav and the breadcrumb in <main>.
    // Use the breadcrumb in <main> to avoid ambiguity.
    await page.getByRole('main').getByRole('link', { name: 'Skills' }).click();
    await page.waitForURL('**/skills', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();

    // The skill should appear in the index by its display name text.
    // The SkillRow link also contains the description and slash_alias in its accessible name,
    // so we look for the name text inside the list and assert the link exists.
    const skillLink = page.getByRole('link', { name: skillName }).first();
    await expect(skillLink).toBeVisible({ timeout: 10_000 });

    // Navigate back into the skill page via the list link and assert edited body persisted.
    await skillLink.click();
    await page.waitForURL(new RegExp(`/skills/${createdSkillId}$`), { timeout: 10_000 });
    await expect(page.getByLabel('Body')).toHaveValue(updatedBody, { timeout: 5_000 });

    // --- 4. Fork a built-in skill (if any exist) ---
    if (hasBuiltins) {
      const firstBuiltin = builtins[0];

      // Navigate back to /skills index to open the Fork browser.
      // Use the breadcrumb in <main> to avoid strict-mode ambiguity with the sidebar link.
      await page.getByRole('main').getByRole('link', { name: 'Skills' }).click();
      await page.waitForURL('**/skills', { timeout: 10_000 });

      await page.getByRole('button', { name: /browse.*fork/i }).click();
      const forkDialog = page.getByRole('dialog', { name: 'Browse and fork a skill' });
      await expect(forkDialog).toBeVisible({ timeout: 5_000 });

      // Wait for the builtins list to load (loading spinner disappears).
      await expect(forkDialog.getByText('Loading…')).toHaveCount(0, { timeout: 10_000 });

      // Click the "Fork {title}" button for the first built-in.
      await forkDialog.getByRole('button', { name: `Fork ${firstBuiltin.title}`, exact: true }).click();

      // After selecting, the form shows a "New name" input pre-filled with the title.
      const newNameInput = forkDialog.getByLabel('New name');
      await expect(newNameInput).toBeVisible({ timeout: 3_000 });

      // Replace with our unique fork name.
      await newNameInput.fill(forkName);

      // Submit fork.
      await forkDialog.getByRole('button', { name: 'Fork', exact: true }).click();

      // On success, redirected to the forked skill's edit page.
      await page.waitForURL(/\/skills\/[0-9a-f-]+$/i, { timeout: 15_000 });

      const forkUrl = page.url();
      const forkIdMatch = forkUrl.match(/\/skills\/([0-9a-f-]+)$/i);
      if (!forkIdMatch) throw new Error(`Unexpected URL after fork: ${forkUrl}`);
      forkedSkillId = forkIdMatch[1];

      // The forked skill's Body should be non-empty (contains the built-in content).
      const forkBodyValue = await page.getByLabel('Body').inputValue();
      expect(forkBodyValue.trim().length).toBeGreaterThan(0);
      console.log(`[skills-authoring] Fork succeeded → id=${forkedSkillId}, body length=${forkBodyValue.length}`);

      // --- 5a. Archive the forked skill ---
      await page.getByRole('button', { name: 'Archive', exact: true }).click();
      const archiveDialog = page.getByRole('dialog', { name: 'Archive skill' });
      await expect(archiveDialog).toBeVisible({ timeout: 5_000 });
      await archiveDialog.getByRole('button', { name: 'Archive', exact: true }).click();

      // Redirected to /skills; forked skill no longer in list.
      await page.waitForURL('**/skills', { timeout: 10_000 });
      await expect(page.getByText(forkName, { exact: true })).toHaveCount(0, { timeout: 10_000 });

      // Mark archived so finally doesn't double-archive.
      forkedSkillId = null;
    } else {
      console.log('[skills-authoring] Skipping fork sub-test — no built-in skills available.');
    }

    // --- 5b. Archive the originally created skill ---
    // Navigate to the skill detail page.
    await page.goto(`/skills/${createdSkillId}`);
    await page.waitForURL(new RegExp(`/skills/${createdSkillId}$`), { timeout: 10_000 });

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    const archiveDialog2 = page.getByRole('dialog', { name: 'Archive skill' });
    await expect(archiveDialog2).toBeVisible({ timeout: 5_000 });
    await archiveDialog2.getByRole('button', { name: 'Archive', exact: true }).click();

    // Redirected to /skills; created skill no longer in list.
    await page.waitForURL('**/skills', { timeout: 10_000 });
    await expect(page.getByText(skillName, { exact: true })).toHaveCount(0, { timeout: 10_000 });

    // Mark archived so finally doesn't double-archive.
    createdSkillId = null;
  } finally {
    // Best-effort cleanup: archive any skill created this run that still exists.
    if (createdSkillId) await archiveSkillApi(tok, createdSkillId);
    if (forkedSkillId) await archiveSkillApi(tok, forkedSkillId);
  }
});
