import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// SQL seeding helpers — seeds via docker compose exec postgres psql.
// Credentials: POSTGRES_USER / POSTGRES_DB from .env (loaded by the test runner).
// Category marker keeps cleanup hermetic.
// ---------------------------------------------------------------------------

const SEED_CATEGORY = 'e2e-memory-review';

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

function seedMemory(content: string, sourceSessionId?: string): void {
	const sessionCol = sourceSessionId ? ', source_session_id' : '';
	const sessionVal = sourceSessionId ? `, '${sourceSessionId}'` : '';
	sql(
		`INSERT INTO autonomous_memory (user_id, state, category, content${sessionCol})` +
			` SELECT id, 'proposed', '${SEED_CATEGORY}', '${content}'${sessionVal}` +
			` FROM users WHERE email = '${process.env.DONNA_E2E_EMAIL}'`
	);
}

function cleanupSeeds(): void {
	sql(`DELETE FROM autonomous_memory WHERE category = '${SEED_CATEGORY}'`);
}

// ---------------------------------------------------------------------------
// Auth helper (house pattern from tests/about.spec.ts)
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
// Test 1: Queue round-trip — seed 2 memories, exercise Keep / Edit & keep /
// Dismiss / Delete flows end-to-end.
// ---------------------------------------------------------------------------

test('queue round-trip: edit & keep A, dismiss B, delete both', async ({ page }) => {
	const suffix = Date.now();
	const contentA = `mem-A-${suffix}`;
	const contentB = `mem-B-${suffix}`;

	try {
		seedMemory(contentA);
		seedMemory(contentB);

		await login(page);
		await page.goto('/automations/review');

		// Both seeds visible under Proposed (default filter).
		await expect(page.getByText(contentA)).toBeVisible();
		await expect(page.getByText(contentB)).toBeVisible();

		// ---- Memory A: Edit & keep ----
		const rowA = page.locator('div').filter({ hasText: contentA }).last();
		await rowA.getByRole('button', { name: 'Edit & keep' }).click();
		const textarea = rowA.getByRole('textbox');
		await expect(textarea).toBeVisible();
		// Clear and type the edited content.
		await textarea.fill(`${contentA}-EDITED`);
		await rowA.getByRole('button', { name: 'Save & keep' }).click();

		// Row leaves proposed view after action + page reload.
		await expect(page.getByText(contentA)).toBeHidden();

		// Switch to Kept filter — A should appear with edited content.
		// SegmentedControl renders as a radiogroup with radio inputs.
		await page.getByRole('radio', { name: 'Kept' }).click();
		await expect(page).toHaveURL(/state=kept/);
		await expect(page.getByText(`${contentA}-EDITED`)).toBeVisible();

		// Two-step delete A.
		const rowAKept = page
			.locator('div')
			.filter({ hasText: `${contentA}-EDITED` })
			.last();
		await rowAKept.getByRole('button', { name: 'Delete' }).click();
		await expect(rowAKept.getByText('Delete memory?')).toBeVisible();
		await rowAKept.getByRole('button', { name: 'Confirm delete' }).click();
		await expect(page.getByText(`${contentA}-EDITED`)).toBeHidden();

		// ---- Memory B: Dismiss ----
		await page.goto('/automations/review');
		await expect(page.getByText(contentB)).toBeVisible();

		const rowB = page.locator('div').filter({ hasText: contentB }).last();
		await rowB.getByRole('button', { name: 'Dismiss' }).click();
		await expect(page.getByText(contentB)).toBeHidden();

		// Switch to Dismissed filter — B should appear.
		await page.getByRole('radio', { name: 'Dismissed' }).click();
		await expect(page).toHaveURL(/state=dismissed/);
		await expect(page.getByText(contentB)).toBeVisible();

		// Two-step delete B.
		const rowBDismissed = page.locator('div').filter({ hasText: contentB }).last();
		await rowBDismissed.getByRole('button', { name: 'Delete' }).click();
		await expect(rowBDismissed.getByText('Delete memory?')).toBeVisible();
		await rowBDismissed.getByRole('button', { name: 'Confirm delete' }).click();
		await expect(page.getByText(contentB)).toBeHidden();
	} finally {
		cleanupSeeds();
	}
});

// ---------------------------------------------------------------------------
// Test 2: Nav + gate — Review tab aria-current; gate absent for opted-in admin.
// ---------------------------------------------------------------------------

test('nav: Review tab is active; AutomationsGate not shown for opted-in admin', async ({
	page
}) => {
	await login(page);
	await page.goto('/automations/review');

	// The Review tab carries aria-current="page".
	const nav = page.locator('nav[aria-label="Automations views"]');
	await expect(nav.getByRole('link', { name: 'Review' })).toHaveAttribute('aria-current', 'page');

	// The gate is NOT shown for the opted-in fixture admin:
	// the Memory h2 is present (gate bypassed) and the gate's "Enable automations"
	// button is absent.
	await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();
	await expect(page.getByRole('button', { name: /enable automations/i })).toBeHidden();
});

// ---------------------------------------------------------------------------
// Test 3: Receipt integration — seed memory C with source_session_id, open the
// session's receipt, keep it inline, chip flips to "kept".
// ---------------------------------------------------------------------------

test('receipt integration: seeded memory shows Keep/Dismiss; Keep flips chip to kept', async ({
	page
}) => {
	// Fetch an existing completed session id via SQL.
	const sessionId = sql(
		`SELECT id FROM autonomous_sessions WHERE status='completed' LIMIT 1`
	).trim();

	if (!sessionId) {
		test.skip(true, 'No completed autonomous session in the dev DB — skipping receipt e2e.');
		return;
	}

	const contentC = `mem-C-${Date.now()}`;

	try {
		seedMemory(contentC, sessionId);

		await login(page);
		await page.goto(`/automations/${sessionId}`);

		// The "Memories this run proposed" section should be visible.
		await expect(page.getByRole('heading', { name: /memories this run proposed/i })).toBeVisible();

		// Memory C row has Keep and Dismiss buttons.
		const memRow = page.locator('li').filter({ hasText: contentC });
		await expect(memRow.getByRole('button', { name: 'Keep' })).toBeVisible();
		await expect(memRow.getByRole('button', { name: 'Dismiss' })).toBeVisible();

		// Click Keep — chip should flip to "kept" and action buttons disappear.
		await memRow.getByRole('button', { name: 'Keep' }).click();

		// After the form action, the chip for this memory row should say "kept".
		await expect(memRow.getByText('kept')).toBeVisible({ timeout: 10_000 });
		await expect(memRow.getByRole('button', { name: 'Keep' })).toBeHidden();
		await expect(memRow.getByRole('button', { name: 'Dismiss' })).toBeHidden();
	} finally {
		cleanupSeeds();
	}
});
