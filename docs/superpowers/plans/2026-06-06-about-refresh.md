# About Refresh (docs-polish PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `/about` guide current with everything shipped since 2026-06-03 (Automations end-to-end, BYOK, run Results, ensemble verification), add a new `/about/automations` rail page, and land two banked copy nits.

**Architecture:** Pure-frontend content work on the existing About guide (SvelteKit prose pages under `src/routes/(app)/about/`, shared rail in `src/lib/about/AboutRail.svelte`) plus two small component copy fixes. An audit fan-out (Task 1) fact-checks every existing page against the live code before rewrites; Tasks 4–8 land the known edits; Task 9 sweeps the remaining audit findings.

**Tech Stack:** Svelte 5 / SvelteKit, Tailwind (mlq-* tokens), vitest + @testing-library/svelte (unit), Playwright (e2e). Quality bar: `npm run check` = 0 errors **0 warnings**; no new lint errors beyond the ~55 pre-existing.

**Spec:** `docs/superpowers/specs/2026-06-06-docs-polish-design.md` (PR 1 half). Branch: `feat/about-refresh`. Commit + push after every task.

**Style conventions for About prose pages** (copy them exactly):
- `<h1 class="mb-4 text-xl font-medium text-mlq-text">`
- section headings: `<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">`
- paragraphs: `<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">`
- lists: `<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">`
- bold UI nouns with `<strong>`.

---

### Task 1: Fact-check audit fan-out (controller-level task)

**Files:**
- Create: `docs/superpowers/plans/2026-06-06-about-refresh-audit.md`

This task is performed by the **controller**, not an implementer subagent: dispatch **10 parallel read-only agents** (subagent_type `Explore`), one per page below. Each agent receives this prompt template (fill `{PAGE}` and `{SOURCES}`):

> Fact-check the About page `{PAGE}` in the Donna repo (/Users/kevinkeller/Code/Donna) against the CURRENT code. Read the page, then read the actual implementation it describes — start from {SOURCES} and follow imports as needed. Return a markdown list of factual defects ONLY (claims that are wrong, stale, or missing major shipped behavior), each as: `- [severity: wrong|stale|gap] <page claim or missing topic> — <what the code actually does> (evidence: file:line)`. Do NOT propose rewrites; do NOT report style/tone issues. If the page is fully accurate, return "No defects."

Page → starting sources map:

| Page | Sources |
|---|---|
| `src/routes/(app)/about/overview/+page.svelte` | `src/lib/AppShell*.svelte` or the `(app)/+layout.svelte` sidebar, `src/routes/(app)/+page.svelte` |
| `src/routes/(app)/about/assistant/+page.svelte` | composer component(s) under `src/lib/chat/`, enhance + skill-attach + file-attach code |
| `src/routes/(app)/about/projects/+page.svelte` | `src/routes/(app)/matters/`, `src/lib/matters/` |
| `src/routes/(app)/about/workflows/+page.svelte` | `src/lib/workflows/WorkflowsNav.svelte`, `src/routes/(app)/{skills,playbooks,prompts}/` |
| `src/routes/(app)/about/tabular/+page.svelte` | `src/lib/tabular/`, `src/routes/(app)/tabular/` |
| `src/routes/(app)/about/knowledge/+page.svelte` | KB routes/components (`src/routes/(app)/knowledge*` or equivalent — locate via grep) |
| `src/routes/(app)/about/models/+page.svelte` | `src/routes/(app)/settings/models/+page.svelte`, `src/lib/inference/` |
| `src/routes/(app)/about/trust/+page.svelte` | trust settings route, receipts/anonymization components |
| `src/routes/(app)/about/lq-ai/+page.svelte` | `src/lib/about/lqLearnSections.ts`, `static/learn/playgrounds/` |
| `src/routes/(app)/about/lq-ai/build/+page.svelte` | the build page's section data + playgrounds |

- [ ] **Step 1: Dispatch all 10 agents in parallel** with the prompt above.
- [ ] **Step 2: Bank results** — write `docs/superpowers/plans/2026-06-06-about-refresh-audit.md` with one `## <page path>` section per page containing that agent's findings verbatim (including "No defects").
- [ ] **Step 3: Cross off** any finding already covered by Tasks 4–8 of this plan — mark it `(covered: Task N)` rather than deleting it.
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-06-06-about-refresh-audit.md
git commit -m "docs(about): fact-check audit of all About pages against current code"
git push
```

---

### Task 2: ProviderKeyRowItem — env-defined-but-empty copy fix

**Files:**
- Modify: `src/lib/inference/ProviderKeyRowItem.svelte:16-20` (status) and `:49-51` (env note)
- Test: `src/lib/inference/ProviderKeyRowItem.svelte.test.ts`

Today a row with `source: 'env', configured: false` renders status **"No key"** directly above **"This key is managed by your deployment's environment."** — contradictory. New behavior: that state shows status **"Not set"** and an explanatory note instead.

- [ ] **Step 1: Write the failing test** — append inside the existing `describe` block:

```ts
it('env-defined but empty: shows "Not set" + empty-variable note, not "No key"/managed-by-env', () => {
  render(ProviderKeyRowItem, { props: { row: row({ configured: false, last4: null, source: 'env' }) } });
  expect(screen.getByText('Not set')).toBeInTheDocument();
  expect(screen.queryByText('No key')).toBeNull();
  expect(screen.getByText(/variable is empty/)).toBeInTheDocument();
  expect(screen.queryByText(/managed by your deployment's environment/)).toBeNull();
  // takeover hint stays — saving a runtime key is the escape hatch
  expect(screen.getByText(/takes over management from the environment/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/inference/ProviderKeyRowItem.svelte.test.ts`
Expected: the new test FAILS (`Not set` not found); the existing 5 pass.

- [ ] **Step 3: Implement** — in `ProviderKeyRowItem.svelte` replace the `statusText` derivation:

```svelte
const statusText = $derived(
  row.configured
    ? `✓ Configured · ${sourceLabel(row)}${row.last4 ? ` · ••••${row.last4}` : ''}`
    : row.source === 'env'
      ? 'Not set'
      : 'No key'
);
```

and replace the env-note block (currently lines 49–51):

```svelte
{#if row.source === 'env'}
  <p class="mt-0.5 text-xs text-mlq-muted">
    {row.configured
      ? "This key is managed by your deployment's environment."
      : "Defined by your deployment's environment, but the variable is empty — set it there, or add a runtime key here."}
  </p>
{/if}
```

(The bottom hint at lines 87–89 — "Saving a key here takes over management from the environment." — stays as-is; it is accurate in both states.)

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/inference/ProviderKeyRowItem.svelte.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inference/ProviderKeyRowItem.svelte src/lib/inference/ProviderKeyRowItem.svelte.test.ts
git commit -m "fix(byok): coherent status for env-defined-but-empty provider rows"
git push
```

---

### Task 3: MatterPicker — selection-aware aria-label

**Files:**
- Modify: `src/lib/matters/MatterPicker.svelte:41`
- Test: `src/lib/matters/MatterPicker.svelte.test.ts`

The trigger button's `aria-label` is statically "Choose matter" even when a matter is selected; screen readers can't tell what's chosen. Make it `Matter: <name>` when one is selected.

⚠️ The existing test `'choosing "No matter" clears the selection back to the default label'` queries the trigger by `name: /choose matter/i` **while `selectedId: 'a'` is set** — it must be updated in the same change (that's the failing-test anchor).

- [ ] **Step 1: Write the failing test** — add a new test AND update the existing third test's trigger query:

```ts
it('trigger aria-label names the selected matter', async () => {
  render(MatterPicker, { props: { matters, selectedId: 'a' } });
  const trigger = screen.getByRole('button', { name: 'Matter: Acme MSA' });
  await fireEvent.click(trigger);
  await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
  expect(screen.getByRole('button', { name: 'Choose matter' })).toBeInTheDocument();
});
```

In the existing test `'choosing "No matter" clears the selection back to the default label'`, change:

```ts
const trigger = screen.getByRole('button', { name: /choose matter/i });
```
to:
```ts
const trigger = screen.getByRole('button', { name: 'Matter: Acme MSA' });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matters/MatterPicker.svelte.test.ts`
Expected: the new test + the updated third test FAIL (no button named `Matter: Acme MSA`); tests 1–2 pass.

- [ ] **Step 3: Implement** — in `MatterPicker.svelte` change line 41:

```svelte
aria-label={current ? `Matter: ${current.name}` : 'Choose matter'}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/matters/MatterPicker.svelte.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Check for other call sites relying on the old label**

Run: `grep -rn "choose matter" src tests --include="*.ts" --include="*.svelte" -i`
Expected: only `MatterPicker.svelte` + its test. If an e2e spec matches the old label with a selected matter, update it the same way.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/MatterPicker.svelte src/lib/matters/MatterPicker.svelte.test.ts
git commit -m "fix(a11y): MatterPicker trigger aria-label names the selected matter"
git push
```

---

### Task 4: New `/about/automations` page + rail entry + e2e

**Files:**
- Create: `src/routes/(app)/about/automations/+page.svelte`
- Modify: `src/lib/about/AboutRail.svelte:4-13` (add entry after Workflows)
- Test: `tests/about.spec.ts` (append one test)

About pages have no unit tests (only e2e via `tests/about.spec.ts` — follow that convention).

- [ ] **Step 1: Add the rail entry** — in `AboutRail.svelte`, insert after the Workflows line:

```ts
{ href: '/about/automations', label: 'Automations' },
```

(final array order: Overview, Assistant, Projects, Workflows, **Automations**, Tabular, Knowledge, Models, Trust & citations).

- [ ] **Step 2: Create the page** — `src/routes/(app)/about/automations/+page.svelte` with exactly this content:

```svelte
<svelte:head><title>Automations — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Automations</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations let Donna run work on its own — a playbook or a skill executed against a knowledge
  base in the background, on demand or on a schedule. Every run leaves a full transparency receipt:
  what the agent did, what it cost, why it stopped, and what it produced.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Turning automations on</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations are off by default. Enable them with the <strong>Automations</strong> toggle in
  <strong>Settings → Preferences</strong>. Until then, automation pages show an inline
  <strong>Automations are off</strong> notice with an enable button, so you can opt in right where
  you need it.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Where to find it</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations is the fourth tab of the <strong>Workflows</strong> hub, alongside Skills, Playbooks,
  and Prompts. Inside it, four views cover the lifecycle: <strong>Sessions</strong> (every run, past
  and live), <strong>Schedules</strong>, <strong>Watches</strong>, and <strong>Notifications</strong>.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Starting a run now</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Press <strong>New run</strong> to start a one-off session. Choose what to run — a
  <strong>playbook</strong> or a <strong>skill</strong> — then pick the <strong>knowledge base</strong>
  the run works against (required), optionally link a <strong>matter</strong>, and optionally set a
  <strong>cost cap</strong> in USD. Donna starts immediately and takes you to the live receipt.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Schedules and watches</h2>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Schedules</strong> run the same configuration on a recurring timer. You describe the cadence with a cron expression — the form previews it in plain language before you save.</li>
  <li><strong>Watches</strong> trigger a run automatically when new documents arrive in a knowledge base — useful for reviewing incoming material without checking manually.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Both are editable after creation — including reassigning or unlinking the matter — and both accept
  a per-run cost cap.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Receipts: what the agent did</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Open any session to see its receipt. The header shows the run's status, its source, total cost,
  and — for finished runs — why it stopped. The <strong>Activity</strong> timeline below lists every
  phase the run moved through and every tool call it made, in order. While a run is live the page
  updates automatically every few seconds.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Results: what the run produced</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Results</strong> section shows the run's work product: its findings, in the order the
  run produced them, each with a severity badge and a severity summary up top. A run can also
  propose <strong>memories</strong> — durable notes it suggests keeping — listed under
  <strong>Memories this run proposed</strong>. Results stream in live while the run works.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Notifications</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When a run finishes, it posts to the <strong>Notifications</strong> view — title, summary, and a
  link straight to the session's receipt. Unread notifications carry a dot; <strong>Mark read</strong>
  clears them one at a time.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Cost caps</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every way of starting a run — run now, schedules, watches — accepts an optional cost cap in USD.
  A run that reaches its cap stops, and the receipt records that as the terminal reason. Combined
  with receipts and notifications, you always know what ran, what it cost, and what it produced.
</p>
```

- [ ] **Step 3: Verify the implementer fact-checks two claims against code** (adjust copy if wrong):
  - cron plain-language preview: `src/lib/automations/CronInput.svelte`
  - watch trigger semantics ("new documents arrive in a knowledge base"): `src/lib/automations/WatchForm.svelte` + `watches.ts`

- [ ] **Step 4: Add the e2e test** — append to `tests/about.spec.ts`:

```ts
test('the About rail includes Automations and the page renders', async ({ page }) => {
  await login(page);
  await page.goto('/about/overview');
  const rail = page.locator('nav[aria-label="About sections"]');
  await rail.getByRole('link', { name: 'Automations' }).click();
  await expect(page).toHaveURL(/\/about\/automations$/);
  await expect(page.getByRole('heading', { name: 'Automations', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Results: what the run produced/i })).toBeVisible();
});
```

- [ ] **Step 5: Run checks** (e2e needs the stack + rebuilt `donna-web`; if the stack is not up, defer the e2e run to Task 10 and say so in the report)

Run: `npm run check`
Expected: `0 ERRORS` and `0 WARNINGS` (ignore the vendor `ERR_MODULE_NOT_FOUND` stderr).

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/about/automations/+page.svelte" src/lib/about/AboutRail.svelte tests/about.spec.ts
git commit -m "feat(about): Automations guide page + rail entry"
git push
```

---

### Task 5: `/about/lq-ai` — move "Build & learn" to the top

**Files:**
- Modify: `src/routes/(app)/about/lq-ai/+page.svelte`
- Test: `tests/about.spec.ts` (strengthen the existing assertion)

User-specified placement: the **"Build & learn with LQ-AI"** `<section>` (currently the bottom block, lines 22–96) moves **between** the intro paragraph (ends "…verified, cited answer.") and the `lqLearnSections` loop (`<div class="mt-8">`).

- [ ] **Step 1: Move the block** — cut the entire `<section class="mt-12 border-t border-mlq-subtle pt-8">…</section>` and paste it directly after the intro `<p>…</p>`, before `<div class="mt-8">`. Change the section's classes from `mt-12 border-t border-mlq-subtle pt-8` to `mt-8 border-t border-mlq-subtle py-8` (top position: keep the separator, add bottom padding so the numbered sections don't crowd it). No other content changes.

- [ ] **Step 2: Strengthen the e2e** — in the existing test `'the Powered by LQ-AI page renders How-It-Works sections + Build & Learn'`, after the two heading assertions add an order check:

```ts
// Build & Learn now sits ABOVE the numbered How-It-Works sections (user-specified order).
const buildLearnBox = await page.getByRole('heading', { name: /Build & learn with LQ-AI/i }).boundingBox();
const bigPictureBox = await page.getByRole('heading', { name: '1. The big picture: System Architecture', level: 2 }).boundingBox();
expect(buildLearnBox!.y).toBeLessThan(bigPictureBox!.y);
```

- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: 0/0. (e2e runs in Task 10 if the stack isn't up.)

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/about/lq-ai/+page.svelte" tests/about.spec.ts
git commit -m "feat(about): move Build & Learn section to the top of the LQ-AI page"
git push
```

---

### Task 6: `/about/models` — rewrite the stale Provider keys section (BYOK)

**Files:**
- Modify: `src/routes/(app)/about/models/+page.svelte:66-72`

The current section claims keys "are not entered or edited in the Donna UI" — the opposite of what shipped in PR #65. Replace the section's paragraph (keep the `<h2>`) with:

- [ ] **Step 1: Replace the paragraph** under the existing `Provider keys` `<h2>` with:

```svelte
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Provider keys</strong> card lists each model provider the deployment knows about
  (Anthropic, OpenAI, and any others) with its key status — <strong>✓ Configured</strong>, with the
  key's source and last four characters, or no key yet. Keys are write-only: Donna never shows a
  stored key, only its last four characters.
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Admins</strong> paste a key into the masked input on a row and press <strong>Add key</strong> (or <strong>Replace key</strong>). Changes apply immediately — no restart needed.</li>
  <li>Keys set by the deployment's <strong>environment</strong> can be taken over by saving a runtime key on the same row. Runtime keys can be revoked with a two-step confirm; environment-managed keys cannot be revoked from the UI.</li>
  <li><strong>Non-admins</strong> see a note that provider keys are managed by an administrator.</li>
</ul>
```

- [ ] **Step 2: Fact-check the rest of the page** against `src/routes/(app)/settings/models/+page.svelte` + `src/lib/inference/ProviderKeysCard.svelte` — in particular the "The page has three sections" sentence (line 40): with Inference categories, Installed local models, and Provider keys it remains three; confirm and leave it (or fix if the audit found otherwise).

- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: 0/0.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/about/models/+page.svelte"
git commit -m "fix(about): Models page Provider keys section now describes BYOK"
git push
```

---

### Task 7: `/about/workflows` — four tabs + Automations cross-link

**Files:**
- Modify: `src/routes/(app)/about/workflows/+page.svelte`

- [ ] **Step 1: Fix the tab count** — the intro paragraph currently says "a hub with three tabs — <strong>Skills</strong>, <strong>Playbooks</strong>, and <strong>Prompts</strong>". Change to:

```svelte
One sidebar entry opens a hub with four tabs — <strong>Skills</strong>,
<strong>Playbooks</strong>, <strong>Prompts</strong>, and <strong>Automations</strong> — each
covering a different kind of reuse.
```

- [ ] **Step 2: Add an Automations section** at the end of the page (after the Saved Prompts paragraphs):

```svelte
<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Automations</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Automations</strong> tab is where Donna runs work on its own — one-off runs,
  cron-style schedules, and watches that fire when new documents arrive in a knowledge base, each
  with a full receipt of what the agent did and what it produced.
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- about section link -->
  See the dedicated <a href="/about/automations" class="font-medium text-mlq-strong hover:underline">Automations guide</a>.
</p>
```

- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: 0/0.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/about/workflows/+page.svelte"
git commit -m "fix(about): Workflows page reflects the four-tab hub incl. Automations"
git push
```

---

### Task 8: `/about/tabular` — cover ensemble verification

**Files:**
- Modify: `src/routes/(app)/about/tabular/+page.svelte`

Shipped UI to describe (verified at plan time): per-column **Ensemble verification** checkbox (`ColumnBuilder.svelte:45-50`), cost-preview line "N ensemble-verified cells · +$X ensemble premium (included above)" (`CostPreviewModal.svelte:41-44`), green **✓ Verified** chip in the cell detail for cells with a `verification_method` (`tabular/[executionId]/+page.svelte:17-27`).

- [ ] **Step 1: Add a paragraph** in the "Defining columns" section, directly after the "Min. model tier" paragraph:

```svelte
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Each manually-defined column also has an <strong>Ensemble verification</strong> checkbox. When
  enabled, the answers in that column are independently cross-checked before being accepted, and
  each verified cell carries a green <strong>✓ Verified</strong> chip in its detail panel.
  Ensemble-verified cells cost more; the cost preview shows the count of ensemble-verified cells
  and the premium as a separate line.
</p>
```

- [ ] **Step 2: Mention the chip where cells are read** — in the "Navigating from a cell to its source" section, extend the first paragraph's panel description: after "the confidence level," insert "an <strong>✓ Verified</strong> chip when the cell was ensemble-verified,".

- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: 0/0.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/about/tabular/+page.svelte"
git commit -m "fix(about): Tabular page covers ensemble verification"
git push
```

---

### Task 9: Apply remaining audit findings

**Files:**
- Modify: any About page with an open finding in `docs/superpowers/plans/2026-06-06-about-refresh-audit.md`
- Modify: `docs/superpowers/plans/2026-06-06-about-refresh-audit.md` (mark dispositions)

- [ ] **Step 1: Read the audit file.** For every finding not marked `(covered: Task N)`:
  - **wrong/stale** → apply the minimal copy correction to the page, citing the agent's evidence (re-verify the evidence file:line before editing — agents can be wrong).
  - **gap** → add the briefest accurate coverage in the page's existing style, or — if it is genuinely minor — mark `(waived: <reason>)` in the audit file.
- [ ] **Step 2: Record dispositions** — every finding in the audit file ends marked `(fixed)`, `(covered: Task N)`, or `(waived: <reason>)`. No unmarked findings remain.
- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: 0/0.

- [ ] **Step 4: Commit** (one commit; per-page commits are fine too if the diff is large)

```bash
git add "src/routes/(app)/about" docs/superpowers/plans/2026-06-06-about-refresh-audit.md
git commit -m "fix(about): apply fact-check audit findings across About pages"
git push
```

---

### Task 10: Full verification (live)

**Files:** none (verification + fixes only)

- [ ] **Step 1: Static gates**

Run: `npm run check`
Expected: `0 ERRORS`, `0 WARNINGS`, exit 0 (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless).

Run: `npx vitest run`
Expected: all green (≥1152 tests; includes the 2 updated component suites).

Run: `npm run lint 2>&1 | tail -5`
Expected: no NEW errors vs `main` (~55 pre-existing; compare with `git stash`-free judgment — count must not exceed main's).

- [ ] **Step 2: Bring the stack up + rebuild `donna-web`** (stale containers serve old bundles)

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```

- [ ] **Step 3: Run the About e2e**

Run: `npx playwright test tests/about.spec.ts`
Expected: all pass, including the two new/strengthened tests (Automations rail page; Build & Learn order).

- [ ] **Step 4: Live page pass** — with a logged-in browser (or via Playwright screenshots), visit all 11 pages: `/about/overview`, `/about/assistant`, `/about/projects`, `/about/workflows`, `/about/automations`, `/about/tabular`, `/about/knowledge`, `/about/models`, `/about/trust`, `/about/lq-ai`, `/about/lq-ai/build`. Confirm: rail shows 9 entries with Automations active-state working, no layout breakage, Build & Learn sits above section 1 on the LQ-AI page.

- [ ] **Step 5: Commit any fixes; push.**

---

## After the plan completes

Outer-loop steps (NOT part of this plan's tasks): whole-branch Opus review → open PR `feat/about-refresh` → user merges → write the PR 2 plan (`docs/repo-presentation`) off updated `main`. If the upstream artifacts SHA lands mid-execution, pause at the next task boundary per the spec's interrupt protocol.
