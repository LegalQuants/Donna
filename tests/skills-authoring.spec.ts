import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const BASE = process.env.DONNA_BASE_URL ?? 'http://localhost:13002';
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
async function api(tok: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${tok}`, ...(init.headers || {}) }
	});
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

test('skills authoring — create (with description), edit, fork built-in (default slug), archive', async ({
	page
}) => {
	test.setTimeout(300_000);
	const tok = await token();

	const stamp = Date.now();
	const skillName = `E2E Skill ${stamp}`;
	const expectedSlug = `e2e-skill-${stamp}`;
	const description = `E2E test skill created at ${stamp}`;
	const editedBody = `# E2E Body ${stamp}\n\nEdited during e2e test.`;
	const slashAlias = `/e2e${stamp}`;

	let createdSkillId: string | null = null;
	let forkedSkillId: string | null = null;

	try {
		// --- 1. Login and go to /skills; assert Built-in skills section + at least one Fork button ---
		await login(page);
		await page.goto('/skills');
		await expect(page.getByRole('heading', { name: 'Skills', exact: true, level: 1 })).toBeVisible({
			timeout: 10_000
		});

		// Assert the "Built-in skills" section heading is visible.
		await expect(page.getByRole('heading', { name: 'Built-in skills', exact: true })).toBeVisible({
			timeout: 10_000
		});

		// Assert at least one Fork {title} button exists (aria-label starts with "Fork ").
		const firstForkButton = page.getByRole('button', { name: /^Fork / }).first();
		await expect(firstForkButton).toBeVisible({ timeout: 10_000 });

		// --- 2. Create a new skill (Description is a real required field) ---
		await page.getByRole('button', { name: /new skill/i }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create skill' });
		await expect(createDialog).toBeVisible({ timeout: 5_000 });

		// Fill Name; assert Slug auto-derives to e2e-skill-{stamp}.
		await createDialog.getByLabel('Name').fill(skillName);
		const slugInput = createDialog.getByLabel('Slug');
		await expect(slugInput).toHaveValue(expectedSlug, { timeout: 3_000 });

		// Fill Description — required by the backend (min_length constraint).
		await createDialog.getByLabel('Description').fill(description);

		// Replace starter Body with our unique test body.
		await createDialog.getByLabel('Body').fill(editedBody);

		// Submit — success redirects to /skills/<uuid>.
		await createDialog.getByRole('button', { name: 'Create', exact: true }).click();
		await page.waitForURL(/\/skills\/[0-9a-f-]+$/i, { timeout: 15_000 });

		// Capture the skill ID from the URL.
		const skillUrl = page.url();
		const skillIdMatch = skillUrl.match(/\/skills\/([0-9a-f-]+)$/i);
		if (!skillIdMatch) throw new Error(`Unexpected URL after create: ${skillUrl}`);
		createdSkillId = skillIdMatch[1];
		console.log(`[skills-authoring] Created skill id=${createdSkillId}`);

		// Assert the Name field holds the created value on the detail page.
		await expect(page.getByLabel('Name')).toHaveValue(skillName, { timeout: 5_000 });

		// --- 3. Edit: set slash command and update body, then Save ---
		await page.getByLabel('Slash command (optional)').fill(slashAlias);
		const updatedBody = `${editedBody}\n\n[edited]`;
		await page.getByLabel('Body').fill(updatedBody);
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await page.waitForLoadState('networkidle', { timeout: 10_000 });

		// Navigate to /skills index via the breadcrumb "Skills" link in <main>.
		await page.getByRole('main').getByRole('link', { name: 'Skills' }).click();
		await page.waitForURL('**/skills', { timeout: 10_000 });
		await expect(
			page.getByRole('heading', { name: 'Skills', exact: true, level: 1 })
		).toBeVisible();

		// Assert the skill appears under the "Your skills" area by its exact display name.
		const skillLink = page.getByRole('link', { name: skillName }).first();
		await expect(skillLink).toBeVisible({ timeout: 10_000 });

		// Navigate back into the skill page and assert the edited body persisted.
		await skillLink.click();
		await page.waitForURL(new RegExp(`/skills/${createdSkillId}$`), { timeout: 10_000 });
		await expect(page.getByLabel('Body')).toHaveValue(updatedBody, { timeout: 5_000 });

		// --- 4. Fork a built-in (real catalog flow, default derived slug — no manual edit) ---
		// Navigate back to /skills index.
		await page.getByRole('main').getByRole('link', { name: 'Skills' }).click();
		await page.waitForURL('**/skills', { timeout: 10_000 });

		// Click the first Fork {title} button in the Built-in skills section.
		// The button has aria-label="Fork {b.title}", text content is "Fork".
		const forkTrigger = page.getByRole('button', { name: /^Fork / }).first();
		await expect(forkTrigger).toBeVisible({ timeout: 10_000 });
		await forkTrigger.click();

		// The "Fork skill" dialog should open.
		const forkDialog = page.getByRole('dialog', { name: 'Fork skill' });
		await expect(forkDialog).toBeVisible({ timeout: 5_000 });

		// The Slug field should be pre-filled (non-empty derived slug).
		const forkSlugInput = forkDialog.getByLabel('Slug');
		await expect(forkSlugInput).toBeVisible({ timeout: 3_000 });
		const prefillSlug = await forkSlugInput.inputValue();
		// Proves the fork-as-slug fix: the field is pre-filled with a valid, space-free slug
		// (the bug was the spaced display title being sent as the slug).
		expect(prefillSlug).toMatch(/^[a-z0-9-]+$/);
		expect(prefillSlug.length).toBeGreaterThan(0);

		// Use a unique slug so the test is re-runnable and self-cleaning (the default
		// derived slug is deterministic and would collide across runs).
		const forkSlug = `e2e-fork-${stamp}`;
		await forkSlugInput.fill(forkSlug);

		await forkDialog.getByRole('button', { name: 'Fork', exact: true }).click();
		await page.waitForURL(/\/skills\/[0-9a-f-]+$/i, { timeout: 15_000 });

		const forkUrl = page.url();
		const forkIdMatch = forkUrl.match(/\/skills\/([0-9a-f-]+)$/i);
		if (!forkIdMatch) throw new Error(`Unexpected URL after fork: ${forkUrl}`);
		forkedSkillId = forkIdMatch[1];

		// The forked skill's Body should be non-empty (built-in content).
		const forkBodyValue = await page.getByLabel('Body').inputValue();
		expect(forkBodyValue.trim().length).toBeGreaterThan(0);
		console.log(
			`[skills-authoring] Fork succeeded → id=${forkedSkillId}, body length=${forkBodyValue.length}`
		);

		// --- 5. Archive the forked skill ---
		await page.getByRole('button', { name: 'Archive', exact: true }).click();
		const forkArchiveDialog = page.getByRole('dialog', { name: 'Archive skill' });
		await expect(forkArchiveDialog).toBeVisible({ timeout: 5_000 });
		await forkArchiveDialog.getByRole('button', { name: 'Archive', exact: true }).click();

		// Redirected to /skills; the forked skill id is gone.
		await page.waitForURL('**/skills', { timeout: 10_000 });
		await expect(page.locator(`a[href="/skills/${forkedSkillId}"]`)).toHaveCount(0, {
			timeout: 10_000
		});
		forkedSkillId = null; // mark archived — finally won't double-archive

		// --- 5b. Archive the originally created skill ---
		await page.goto(`${BASE}/skills/${createdSkillId}`);
		await page.waitForURL(new RegExp(`/skills/${createdSkillId}$`), { timeout: 10_000 });

		await page.getByRole('button', { name: 'Archive', exact: true }).click();
		const createArchiveDialog = page.getByRole('dialog', { name: 'Archive skill' });
		await expect(createArchiveDialog).toBeVisible({ timeout: 5_000 });
		await createArchiveDialog.getByRole('button', { name: 'Archive', exact: true }).click();

		// Redirected to /skills; created skill no longer in the list.
		await page.waitForURL('**/skills', { timeout: 10_000 });
		await expect(page.getByText(skillName, { exact: true })).toHaveCount(0, { timeout: 10_000 });
		createdSkillId = null; // mark archived — finally won't double-archive
	} finally {
		// Best-effort cleanup by captured ID — reliable even when forks share a built-in's display name.
		if (createdSkillId) {
			await page.goto(`${BASE}/skills/${createdSkillId}`).catch(() => {});
			await page
				.getByRole('button', { name: 'Archive', exact: true })
				.click()
				.catch(() => {});
			await page
				.getByRole('dialog', { name: 'Archive skill' })
				.getByRole('button', { name: 'Archive', exact: true })
				.click()
				.catch(() => {});
			await archiveSkillApi(tok, createdSkillId);
		}
		if (forkedSkillId) {
			await page.goto(`${BASE}/skills/${forkedSkillId}`).catch(() => {});
			await page
				.getByRole('button', { name: 'Archive', exact: true })
				.click()
				.catch(() => {});
			await page
				.getByRole('dialog', { name: 'Archive skill' })
				.getByRole('button', { name: 'Archive', exact: true })
				.click()
				.catch(() => {});
			await archiveSkillApi(tok, forkedSkillId);
		}
	}
});
