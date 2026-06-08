import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// SQL seeding helpers — seeds via docker compose exec postgres psql.
// Credentials: POSTGRES_USER / POSTGRES_DB from .env (loaded by the test runner).
// Name prefix keeps cleanup hermetic.
// ---------------------------------------------------------------------------

const SEED_PREFIX = 'e2e-artifact';

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

function cleanupSeeds(): void {
	sql(`DELETE FROM autonomous_artifacts WHERE name LIKE '${SEED_PREFIX}%'`);
}

// ---------------------------------------------------------------------------
// Auth helper — house pattern from automations-memory-review.spec.ts
// ---------------------------------------------------------------------------

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// ---------------------------------------------------------------------------
// Test 1: Seeded artifacts on a real completed session — the Documents block
// renders, Download link targets the proxy, Open mounts the doc panel; a
// deleted-file row (file_id NULL) shows metadata only ("file deleted").
// ---------------------------------------------------------------------------

test('receipt shows seeded artifacts with Open + Download and a deleted-file row', async ({
	page
}) => {
	// autonomous_sessions.user_id FK → users.id
	const sessionId = sql(
		`SELECT s.id FROM autonomous_sessions s JOIN users u ON s.user_id = u.id` +
			` WHERE s.status='completed' AND u.email='${EMAIL}' LIMIT 1`
	);
	if (!sessionId) test.skip(true, 'No completed autonomous session for the e2e user.');

	// files uses owner_id (not user_id) FK → users.id
	const fileId = sql(
		`SELECT f.id FROM files f JOIN users u ON f.owner_id = u.id` +
			` WHERE u.email='${EMAIL}' AND f.deleted_at IS NULL LIMIT 1`
	);
	if (!fileId) test.skip(true, 'No file owned by the e2e user in the dev DB.');

	cleanupSeeds();
	// Row with a real file_id → shows Open + Download.
	sql(
		`INSERT INTO autonomous_artifacts (session_id, file_id, name, mime, size_bytes)` +
			` VALUES ('${sessionId}', '${fileId}', '${SEED_PREFIX}-memo.md', 'text/markdown', 4608)`
	);
	// Row with NULL file_id → shows "file deleted" metadata only.
	sql(
		`INSERT INTO autonomous_artifacts (session_id, file_id, name, mime, size_bytes)` +
			` VALUES ('${sessionId}', NULL, '${SEED_PREFIX}-deleted.md', 'text/markdown', 100)`
	);

	try {
		await login(page);
		await page.goto(`/automations/${sessionId}`);

		const results = page.getByRole('region', { name: 'Results' });
		await expect(results.getByRole('heading', { name: 'Documents' })).toBeVisible();

		// Live row: name + size + Download link + Open button.
		const row = results.locator('li', { hasText: `${SEED_PREFIX}-memo.md` });
		await expect(row.getByText('4.5 KB')).toBeVisible();

		const downloadLink = row.getByRole('link', { name: /download/i });
		await expect(downloadLink).toHaveAttribute('href', `/files/${fileId}/content`);

		// Download actually serves bytes through the SvelteKit proxy.
		const dl = await page.request.get(`/files/${fileId}/content`);
		expect(dl.ok()).toBe(true);

		// Open mounts the doc panel (aside landmark).
		await row.getByRole('button', { name: /open/i }).click();
		await expect(page.getByRole('complementary', { name: 'Document panel' })).toBeVisible();

		// Deleted-file row: metadata only — "file deleted" text; no Open button.
		const deleted = results.locator('li', { hasText: `${SEED_PREFIX}-deleted.md` });
		await expect(deleted.getByText('file deleted')).toBeVisible();
		await expect(deleted.getByRole('button', { name: /open/i })).toBeHidden();
	} finally {
		cleanupSeeds();
	}
});

// ---------------------------------------------------------------------------
// Test 2: A session with zero artifacts hides the Documents block entirely.
// ---------------------------------------------------------------------------

test('a session with no artifacts shows no Documents block', async ({ page }) => {
	const sessionId = sql(
		`SELECT s.id FROM autonomous_sessions s JOIN users u ON s.user_id = u.id` +
			` WHERE s.status='completed' AND u.email='${EMAIL}'` +
			` AND NOT EXISTS (SELECT 1 FROM autonomous_artifacts a WHERE a.session_id = s.id) LIMIT 1`
	);
	if (!sessionId) test.skip(true, 'No artifact-free completed session for the e2e user.');

	await login(page);
	await page.goto(`/automations/${sessionId}`);

	const results = page.getByRole('region', { name: 'Results' });
	await expect(results).toBeVisible();
	await expect(results.getByRole('heading', { name: 'Documents' })).toBeHidden();
});
