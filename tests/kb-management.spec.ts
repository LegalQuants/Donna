import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

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

test('KB management — create from matter, upload + auto-attach, rename, α, detach, archive', async ({
	page
}) => {
	test.setTimeout(300_000);
	const tok = await token();

	const ts = Date.now();
	const matterName = `E2E KB-Mgmt Matter ${ts}`;
	const kbName = `E2E KB ${ts}`;
	const renamedKb = `E2E KB Renamed ${ts}`;
	const pid = (
		await api(tok, '/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: matterName })
		}).then((r) => r.json())
	).id as string;

	let createdKbId: string | null = null;

	try {
		await login(page);
		await page.goto(`/matters/${pid}`);

		// Create the KB from the matter's Knowledge section.
		await page.getByRole('button', { name: /link a knowledge base/i }).click();
		await page.getByRole('button', { name: /create new kb/i }).click();
		await page.getByLabel(/name/i).fill(kbName);
		await page.getByRole('button', { name: 'Create', exact: true }).click();
		await expect(page.getByText(kbName, { exact: true })).toBeVisible({ timeout: 15_000 });

		// Resolve the KB id via API for cleanup + navigation assertion.
		const kbs = await api(tok, '/knowledge-bases?project_id=' + pid).then((r) => r.json());
		const found = (kbs as Array<{ id: string; name: string }>).find((k) => k.name === kbName);
		if (!found) throw new Error('Seeded KB not visible in API list');
		createdKbId = found.id;

		// Navigate to KB detail via Manage.
		await page.getByRole('link', { name: /manage/i }).click();
		await page.waitForURL(new RegExp(`/knowledge/${createdKbId}$`));
		await expect(page.getByRole('heading', { name: kbName })).toBeVisible();

		// Upload spike.pdf via the hidden multipart input.
		const fileChooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: /upload files/i }).click();
		const chooser = await fileChooserPromise;
		await chooser.setFiles(PDF);

		// Pending → Processing → Ready (the auto-attach happens on ready).
		await expect(page.getByText('Pending')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Ready')).toBeVisible({ timeout: 180_000 });

		// Rename via modal.
		await page.getByRole('button', { name: 'Rename', exact: true }).click();
		const renameDialog = page.getByRole('dialog', { name: /rename knowledge base/i });
		await expect(renameDialog).toBeVisible();
		await renameDialog.getByRole('textbox', { name: 'Name' }).fill(renamedKb);
		await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByRole('heading', { name: renamedKb })).toBeVisible({ timeout: 15_000 });

		// Hybrid α: drag slider to 0.8 + navigate away + back + assert persistence.
		// (Uses SPA nav to /knowledge list then back — avoids the post-reload SSR
		// hydration issue where the first SPA action's invalidateAll doesn't update
		// the component's data prop in SvelteKit 2 + Svelte 5.)
		const slider = page.getByRole('slider', { name: /hybrid alpha/i });
		await slider.fill('0.8');
		// Wait for debounce + save round-trip.
		await page.waitForTimeout(1500);
		// Navigate away via SPA breadcrumb link.
		await page.getByRole('link', { name: 'Knowledge' }).click();
		await page.waitForURL('**/knowledge');
		// Navigate back via SPA — the KB list shows the renamed KB.
		await page.getByRole('link', { name: renamedKb }).click();
		await page.waitForURL(new RegExp(`/knowledge/${createdKbId}$`));
		await expect(page.getByRole('slider', { name: /hybrid alpha/i })).toHaveValue('0.8');

		// Detach the attached file.
		await page.getByRole('button', { name: /remove spike\.pdf/i }).click();
		// Dropzone reappears when files=0 and pendingUploads=0.
		await expect(page.getByRole('button', { name: /upload files/i })).toBeVisible({
			timeout: 15_000
		});

		// Archive the KB → redirect to /knowledge, KB no longer listed.
		await page.getByRole('button', { name: 'Archive', exact: true }).click();
		await page.waitForURL('**/knowledge');
		await expect(page.getByText(renamedKb, { exact: true })).toHaveCount(0, { timeout: 10_000 });
	} finally {
		// Unconditional cleanup.
		await api(tok, `/projects/${pid}`, { method: 'DELETE' });
		if (createdKbId) await api(tok, `/knowledge-bases/${createdKbId}`, { method: 'DELETE' });
	}
});
