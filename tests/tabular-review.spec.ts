import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

// Plain .txt does NOT ingest on this stack (unsupported_type); use an existing spike PDF
// or generate one via cupsfilter.
function pdfFixture(): string {
  const candidates = ['/tmp/spike-donna.pdf', '/tmp/spike.pdf', '/tmp/spike2.pdf'];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const p = join(tmpdir(), 'donna-tabular.pdf');
  if (!existsSync(p)) execSync(`cupsfilter /etc/hosts > "${p}" 2>/dev/null`);
  return p;
}

// A PDF whose content actually answers a "Governing law" column, so the cell extracts a
// value with a real citation (the /etc/hosts spike PDF yields a failed, citation-less cell).
function answerablePdfFixture(): string {
  const p = join(tmpdir(), 'donna-governing-law.pdf');
  if (!existsSync(p)) {
    const src = join(process.cwd(), 'tests/fixtures/governing-law.txt');
    execSync(`cupsfilter "${src}" > "${p}" 2>/dev/null`);
  }
  return p;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

// Run the builder (at /tabular/new) for one uploaded doc + one column; land on the run page.
async function runReview(page: Page, fixture: string, question: string) {
  await page.goto('/tabular/new');
  await page.getByRole('button', { name: /^Upload$/ }).click();
  await page.getByTestId('dropzone-input').setInputFiles(fixture);
  await expect(page.getByText(/document selected/i)).toBeVisible({ timeout: 120_000 });
  await page.getByPlaceholder('Column name').fill('Governing law');
  await page.getByLabel('Column question').fill(question);
  await page.getByRole('button', { name: 'Preview cost' }).click();
  const dialog = page.getByRole('dialog', { name: /confirm review cost/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Run review' }).click();
  await page.waitForURL(/\/tabular\/[0-9a-f-]+$/i, { timeout: 15_000 });
}

test('tabular: build at /tabular/new — upload, column, preview, run, grid, export', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await runReview(page, pdfFixture(), "Which state's or country's law governs this document?");

  // Grid: column header + a single populated row (tolerant of a failed extraction).
  await expect(page.getByText('Governing law')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 180_000 });

  // Export menu exposes the Excel link.
  await page.getByRole('button', { name: /export/i }).click();
  await expect(page.getByRole('link', { name: /excel/i })).toHaveAttribute('href', /export\?format=xlsx/);
});

test('tabular: /tabular is the history index — lists runs, resumes one, opens New review', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  // Ensure at least one execution exists.
  await runReview(page, pdfFixture(), "Which law governs?");
  const runUrl = page.url();
  const runId = runUrl.split('/').pop()!;

  // History index lists executions; the just-created one is present and links to its run page.
  await page.goto('/tabular');
  await expect(page.getByRole('heading', { name: 'Tabular reviews' })).toBeVisible();
  const row = page.locator(`a[href="/tabular/${runId}"]`).first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Resume: clicking the row opens its run page.
  await row.click();
  await page.waitForURL(`**/tabular/${runId}`);
  await expect(page.getByRole('heading', { name: 'Tabular review' })).toBeVisible();

  // New review entry point goes to the relocated builder.
  await page.goto('/tabular');
  await page.getByRole('link', { name: /new review/i }).first().click();
  await page.waitForURL('**/tabular/new');
  await expect(page.getByRole('heading', { name: /new tabular review/i })).toBeVisible();
});

test('tabular: a cell citation opens the cited source in the doc panel', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await runReview(page, answerablePdfFixture(), "Which state's law governs this document?");

  // Wait for the grid, then open the cell detail for the Governing law column.
  await expect(page.getByText('Governing law')).toBeVisible({ timeout: 180_000 });
  // The first body cell (Governing law) — click it to open CellDetail.
  await page.locator('table tbody tr td').nth(1).getByRole('button').click();

  const detail = page.getByRole('dialog', { name: /cell detail/i });
  await expect(detail).toBeVisible();

  // A navigable citation button (aria-label "Open source, page N") should be present and,
  // when clicked, open the document panel. Skip gracefully if extraction produced no citation.
  const citation = detail.getByRole('button', { name: /open source, page/i }).first();
  await expect(citation).toBeVisible({ timeout: 180_000 });
  await citation.click();
  // Doc panel mounts; it fetches /files/{id} and renders the source.
  await expect(page.getByRole('complementary', { name: /document panel/i })).toBeVisible({ timeout: 30_000 });
});

// The per-column Ensemble verification toggle reaches the run and the review completes.
// NOTE: the ensemble *output* (cost premium + a "✓ Verified" doc-panel chip) only appears when the
// gateway has `citation_engine.ensemble_verification.judge_models` configured (a deployment setting;
// the dev stack ships it opt-in/empty, which disables Stage 4). The premium-line and verified-chip
// *rendering* are covered deterministically by unit tests (CostPreviewModal / citations / DocumentPanel);
// this e2e proves the FE sends the flag and the backend accepts it end-to-end without breaking the run.
test('tabular: an ensemble-verified column runs to completion', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await page.goto('/tabular/new');

  await page.getByRole('button', { name: /^Upload$/ }).click();
  await page.getByTestId('dropzone-input').setInputFiles(answerablePdfFixture());
  await expect(page.getByText(/document selected/i)).toBeVisible({ timeout: 120_000 });
  await page.getByPlaceholder('Column name').fill('Governing law');
  await page.getByLabel('Column question').fill("Which state's law governs this document?");

  // The per-column Ensemble verification checkbox is present and toggles on.
  const ensemble = page.getByRole('checkbox', { name: /ensemble verification/i });
  await expect(ensemble).toBeVisible();
  await ensemble.check();
  await expect(ensemble).toBeChecked();

  // Preview → run; the request carrying ensemble_verification is accepted and the review completes.
  await page.getByRole('button', { name: 'Preview cost' }).click();
  const dialog = page.getByRole('dialog', { name: /confirm review cost/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Run review' }).click();
  await page.waitForURL(/\/tabular\/[0-9a-f-]+$/i, { timeout: 15_000 });

  await expect(page.getByText('Governing law')).toBeVisible({ timeout: 240_000 });
  await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 240_000 });
});

test('tabular: run a built-in table skill — its resolved columns render in the grid', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await page.goto('/tabular/new');

  // Upload an answerable doc (starts ingestion).
  await page.getByRole('button', { name: /^Upload$/ }).click();
  await page.getByTestId('dropzone-input').setInputFiles(answerablePdfFixture());
  await expect(page.getByText(/document selected/i)).toBeVisible({ timeout: 120_000 });

  // Switch to table-skill mode and pick a built-in table skill.
  await page.getByRole('radio', { name: /use a table skill/i }).click();
  await page.getByRole('button', { name: /contract snapshot/i }).click();

  // Preview → run.
  await page.getByRole('button', { name: 'Preview cost' }).click();
  const dialog = page.getByRole('dialog', { name: /confirm review cost/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Run review' }).click();
  await page.waitForURL(/\/tabular\/[0-9a-f-]+$/i, { timeout: 15_000 });

  // The skill resolves to its own columns server-side; the grid renders them.
  // Contract Snapshot defines a "Governing Law" column.
  await expect(page.getByText('Governing Law')).toBeVisible({ timeout: 180_000 });
});
