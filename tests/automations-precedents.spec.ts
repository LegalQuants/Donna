import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// SQL seeding helpers — seeds via docker compose exec postgres psql.
// Credentials: POSTGRES_USER / POSTGRES_DB from .env (env names verified in
// automations-memory-review.spec.ts).
// Category marker keeps cleanup hermetic: pattern_kind = 'e2e-precedent'.
// ---------------------------------------------------------------------------

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

function seedPrecedent(summary: string): void {
	sql(
		`INSERT INTO precedent_entries (user_id, pattern_kind, summary, observed_count)` +
			` SELECT id, 'e2e-precedent', '${summary}', 3 FROM users WHERE email = '${process.env.DONNA_E2E_EMAIL}'`
	);
}

function cleanupSeeds(): void {
	// FK finding: 0041_project_context_proposals.py declares
	// fk_project_context_proposals_precedent_id with ondelete="CASCADE".
	// Proposals are therefore automatically deleted when their parent precedent
	// row is deleted. The explicit DELETE below is a safety guard for any
	// proposals that may have outlived the marker sweep (e.g., tests that
	// create proposals against non-marker precedents), but is not strictly
	// required thanks to CASCADE.
	sql(
		`DELETE FROM project_context_proposals WHERE precedent_id IN (SELECT id FROM precedent_entries WHERE pattern_kind = 'e2e-precedent')`
	);
	sql(`DELETE FROM precedent_entries WHERE pattern_kind = 'e2e-precedent'`);
}

// ---------------------------------------------------------------------------
// Auth helpers (reuse matters.spec.ts pattern)
// ---------------------------------------------------------------------------

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
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

async function apiCall(tok: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${tok}`, ...(init.headers ?? {}) }
	});
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// ---------------------------------------------------------------------------
// Scratch matter — created once for the promote + reject tests
// ---------------------------------------------------------------------------

let scratchMatterId: string;
let scratchMatterName: string;
let tok: string;

test.beforeAll(async () => {
	tok = await token();
	scratchMatterName = `E2E Precedents ${Date.now()}`;
	const res = await apiCall(tok, '/projects', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: scratchMatterName })
	});
	const body = await res.json();
	scratchMatterId = body.id;
});

test.afterAll(async () => {
	if (scratchMatterId) {
		await apiCall(tok, `/projects/${scratchMatterId}`, { method: 'DELETE' });
	}
});

// ---------------------------------------------------------------------------
// Helpers for robust locators
// ---------------------------------------------------------------------------

/**
 * Locate a PrecedentRow card by the unique summary text.
 * The card is the outermost div containing the summary; the summary text lives
 * in a <p> that is a direct child of the card (not inside any inner div), so
 * `filter({ hasText })` returns a single match at the card level.
 */
function precedentCard(page: Page, summary: string) {
	return page.locator('div').filter({ hasText: summary }).last();
}

/**
 * Locate a ProposalRow card by matter name.
 * ProposalRow: card div → header div (contains "For matter: …") → pre (sibling).
 * Using `.last()` alone would select the inner header div (which has no <pre>).
 * Instead, filter to divs that BOTH contain the matter text AND have a <pre>
 * descendant — matching only the card div.
 */
function proposalCard(page: Page, matterName: string) {
	return page
		.locator('div')
		.filter({ hasText: `For matter: ${matterName}` })
		.filter({ has: page.locator('pre') })
		.first();
}

// ---------------------------------------------------------------------------
// Test 1: Dismiss — round-trip (two-step confirm)
// ---------------------------------------------------------------------------

test('dismiss: two-step removes precedent from the list', async ({ page }) => {
	test.setTimeout(60_000);
	const summary = `dismiss-e2e-${Date.now()}`;

	try {
		seedPrecedent(summary);

		await login(page);
		await page.goto('/automations/review');

		// Precedents section shows the seeded row.
		await expect(page.getByText(summary)).toBeVisible();

		const row = precedentCard(page, summary);
		await expect(row.getByText('e2e-precedent')).toBeVisible();
		await expect(row.getByText('seen 3×')).toBeVisible();

		// Step 1: click Dismiss button.
		await row.getByRole('button', { name: 'Dismiss' }).click();

		// Step 2: confirmation inline.
		await expect(row.getByText('Dismiss precedent?')).toBeVisible();
		await row.getByRole('button', { name: 'Confirm dismiss' }).click();

		// Row leaves the list after action + reload.
		await expect(page.getByText(summary)).toBeHidden({ timeout: 10_000 });
	} finally {
		cleanupSeeds();
	}
});

// ---------------------------------------------------------------------------
// Test 2: Promote → proposal → accept writes matter context
// ---------------------------------------------------------------------------

test('promote: creates proposal; accept appends to matter context_md', async ({ page }) => {
	test.setTimeout(90_000);
	const summary = `promote-e2e-${Date.now()}`;

	try {
		seedPrecedent(summary);

		await login(page);
		await page.goto('/automations/review');

		await expect(page.getByText(summary)).toBeVisible();

		const row = precedentCard(page, summary);

		// Open the Promote panel.
		await row.getByRole('button', { name: 'Promote…' }).click();

		// MatterPicker is present; Create proposal disabled until a matter is picked.
		await expect(row.getByRole('button', { name: 'Choose matter' })).toBeVisible();
		await expect(row.getByRole('button', { name: 'Create proposal' })).toBeDisabled();

		// Open the picker and select the scratch matter.
		// MatterPicker renders options as <button type="button"> inside a <ul>
		// dropdown (not role="option"). The dropdown is inside the row subtree.
		await row.getByRole('button', { name: 'Choose matter' }).click();
		await row.getByRole('button', { name: scratchMatterName, exact: true }).click();

		// Now Create proposal is enabled.
		await expect(row.getByRole('button', { name: 'Create proposal' })).toBeEnabled();

		// Submit the promote form.
		await row.getByRole('button', { name: 'Create proposal' }).click();

		// "Proposal created below." banner appears after the action.
		await expect(page.getByText('Proposal created below.')).toBeVisible({ timeout: 15_000 });

		// Proposals section shows a row for the scratch matter.
		await expect(page.getByText(`For matter: ${scratchMatterName}`)).toBeVisible();

		// Capture the rendered suggested_md from the proposal's <pre> block.
		// Use the dual-filter helper to get the card (not the inner header div).
		const pRow = proposalCard(page, scratchMatterName);
		const preEl = pRow.locator('pre');
		await expect(preEl).toBeVisible();
		const suggestedMd = await preEl.textContent();
		expect(suggestedMd).toBeTruthy();

		// Extract a distinctive ~20-char substring from the middle of suggested_md.
		const normalized = (suggestedMd ?? '').replace(/\s+/g, ' ').trim();
		const mid = Math.floor(normalized.length / 2);
		const snippet = normalized.slice(Math.max(0, mid - 10), mid + 10).trim();
		expect(snippet.length).toBeGreaterThan(5);

		// Two-step Accept.
		await pRow.getByRole('button', { name: 'Accept' }).click();
		await expect(pRow.getByText("Add this to the matter's context?")).toBeVisible();
		await pRow.getByRole('button', { name: 'Confirm accept' }).click();

		// Proposal row leaves the list.
		await expect(page.getByText(`For matter: ${scratchMatterName}`)).toBeHidden({
			timeout: 10_000
		});

		// Fetch the matter via API; context_md should contain the snippet.
		const matterRes = await apiCall(tok, `/projects/${scratchMatterId}`);
		const matter = await matterRes.json();
		const contextNormalized = ((matter.context_md as string) ?? '').replace(/\s+/g, ' ').trim();
		expect(contextNormalized).toContain(snippet);
	} finally {
		cleanupSeeds();
	}
});

// ---------------------------------------------------------------------------
// Test 3: Reject — proposal leaves list; matter context unchanged
// ---------------------------------------------------------------------------

test('reject: removes proposal; matter context_md unchanged', async ({ page }) => {
	test.setTimeout(90_000);

	// Fetch current context_md baseline before the test modifies anything.
	const beforeRes = await apiCall(tok, `/projects/${scratchMatterId}`);
	const beforeMatter = await beforeRes.json();
	const contextBefore: string = (beforeMatter.context_md as string) ?? '';

	const summary = `reject-e2e-${Date.now()}`;

	try {
		seedPrecedent(summary);

		await login(page);
		await page.goto('/automations/review');

		await expect(page.getByText(summary)).toBeVisible();

		const row = precedentCard(page, summary);

		// Open the Promote panel and pick the scratch matter.
		// MatterPicker options are <button> elements inside the row's dropdown.
		await row.getByRole('button', { name: 'Promote…' }).click();
		await row.getByRole('button', { name: 'Choose matter' }).click();
		await row.getByRole('button', { name: scratchMatterName, exact: true }).click();
		await row.getByRole('button', { name: 'Create proposal' }).click();

		// Wait for the Proposals section to show the new row.
		await expect(page.getByText(`For matter: ${scratchMatterName}`)).toBeVisible({
			timeout: 15_000
		});

		const pRow = proposalCard(page, scratchMatterName);

		// Single-step Reject.
		await pRow.getByRole('button', { name: 'Reject' }).click();

		// Proposal row leaves the list.
		await expect(page.getByText(`For matter: ${scratchMatterName}`)).toBeHidden({
			timeout: 10_000
		});

		// Fetch the matter via API; context_md must be unchanged (reject must not write).
		const afterRes = await apiCall(tok, `/projects/${scratchMatterId}`);
		const afterMatter = await afterRes.json();
		const contextAfter: string = (afterMatter.context_md as string) ?? '';
		expect(contextAfter).toBe(contextBefore);

		// Also assert the reject-test summary is absent from context.
		expect(contextAfter).not.toContain(summary);
	} finally {
		cleanupSeeds();
	}
});
