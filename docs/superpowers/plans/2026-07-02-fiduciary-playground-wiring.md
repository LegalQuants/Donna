# Fiduciary Playground Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Wire LQ-AI's 5 now-shipped fiduciary-grade Learn playgrounds (DE-365 sub-2, LQ-AI PR #262, main `0766164`) into Donna — vendored local copies + per-section drill-downs on `/about/fiduciary` + registration in the `/about/lq-ai` gallery.

**Architecture:** Donna serves **vendored local copies** of LQ-AI playgrounds (it can't deep-link LQ-AI's runtime — Donna replaces that frontend). Copy the 5 self-contained `.html` from LQ-AI `0766164`'s `web/static/learn/playgrounds/` into Donna's `static/learn/playgrounds/` (**no submodule pin bump** — static viz is decoupled from the API contract; the pin bump rides the upstream-ask deliveries + release later). Then add honest, illustrative-framed drill-down links.

**Tech Stack:** SvelteKit, Tailwind, Vitest, Playwright.

## Global Constraints

- **No submodule pin bump** (pin stays `5aa9135`). Vendored source SHA = LQ-AI `0766164`.
- **Final slugs (safe to hard-link, won't change):** `authority-sources`, `citation-ledger`, `fiduciary-gate`, `treatment-layer`, `matter-session-flow`.
- **Honest framing:** these are **illustrative** walkthroughs (synthetic/static data, no live calls). Do not imply they show the user's live data. Carry each viz's caveat.
- **The `fiduciary-gate` playground shows per-CITATION bucketing (PASS/SUPPORTED/FAIL)** — a _different layer_ from Donna's per-TURN 4 trust states; frame its link so they aren't conflated.
- Prose page = bare `.svelte` (mirror existing `/about/fiduciary`); `lqLearnSections` entries match the existing `{ number, title, paragraphs[], playground, sourceLabel, sourceUrl }` shape; `sourceUrl` must be a `https://github.com/LegalQuants/lq-ai/...` blob URL; no `LQ.AI` dotted spelling.
- Gates every task: `npm run check` 0/0, `npm run lint` green, `npx vitest run` passing. Merge commit; mirror to `tucuxi`.

---

### Task 1: Vendor the 5 playground files + guard test

**Files:** Create `static/learn/playgrounds/{authority-sources,citation-ledger,fiduciary-gate,treatment-layer,matter-session-flow}.html`; Test `src/lib/about/fiduciaryPlaygrounds.test.ts`.

- [ ] **Step 1: Copy the 5 files from the fetched LQ-AI main**

```bash
cd /Users/kevinkeller/Code/Donna
for s in authority-sources citation-ledger fiduciary-gate treatment-layer matter-session-flow; do
  git -C vendor/lq-ai show origin/main:web/static/learn/playgrounds/$s.html > static/learn/playgrounds/$s.html
done
```

- [ ] **Step 2: Guard test** — create `src/lib/about/fiduciaryPlaygrounds.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SLUGS = [
	'authority-sources',
	'citation-ledger',
	'fiduciary-gate',
	'treatment-layer',
	'matter-session-flow'
];

describe('vendored fiduciary playgrounds', () => {
	for (const slug of SLUGS) {
		it(`${slug}.html is present and self-contained`, () => {
			const html = readFileSync(`static/learn/playgrounds/${slug}.html`, 'utf-8');
			expect(html.length).toBeGreaterThan(1000);
			expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
			expect(html).not.toMatch(/<link[^>]+stylesheet/i);
		});
	}
});
```

- [ ] **Step 3:** `npx vitest run src/lib/about/fiduciaryPlaygrounds.test.ts` → PASS (5/5).
- [ ] **Step 4:** Gates (`npm run check && npm run lint && npx vitest run`). Note: prettier may reformat the vendored HTML — accept it.
- [ ] **Step 5:** Commit `git add static/learn/playgrounds/*.html src/lib/about/fiduciaryPlaygrounds.test.ts && git commit -m "feat(fiduciary): vendor the 5 LQ-AI fiduciary Learn playgrounds (from lq-ai 0766164)"`

---

### Task 2: Register the 5 in the `/about/lq-ai` gallery (`lqLearnSections.ts`)

**Files:** Modify `src/lib/about/lqLearnSections.ts` (append 5 entries, numbers 17–21); Test `src/lib/about/lqLearnSections.test.ts`.

- [ ] **Step 1:** Append to the `lqLearnSections` array (before the closing `]`), each entry carrying the viz's honest caveat:

```ts
	{
		number: 17,
		title: 'The fiduciary loop: authority sources',
		paragraphs: [
			'The authority-sources registry is where retrieve-and-verify begins: primary law fetched and character-verified across CourtListener (US case law), GovInfo (US Code / CFR), SEC EDGAR (filings), and EUR-Lex (EU law). This playground lets you toggle which providers an operator configured and watch each report enabled or unavailable-with-reason.',
			'Honest caveats: EUR-Lex is get-by-CELEX only (keyword search is DE-374, treaty coverage DE-375); every source is operator-config-gated and reported unavailable-with-reason, never silently hidden. Illustrative walkthrough — synthetic data, not a live call.'
		],
		playground: 'authority-sources',
		sourceLabel: 'api/app/citation/authority.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/citation/authority.py'
	},
	{
		number: 18,
		title: 'The fiduciary loop: the citation ledger',
		paragraphs: [
			'The citation ledger records every source and passage the agent actually read: source → passage-read → verification status → one-click trace to the source and character offset. Provenance-only entries are flagged as non-assertions (consulted, not quoted).',
			'Honest caveat: the ledger references content by identifier and character offset only — no raw payloads are stored in the audit layer (the P3 no-raw-payload guarantee). Illustrative walkthrough.'
		],
		playground: 'citation-ledger',
		sourceLabel: 'ADR 0018 — citation ledger & fiduciary-grade output',
		sourceUrl:
			'https://github.com/LegalQuants/lq-ai/blob/main/docs/adr/0018-citation-ledger-and-fiduciary-grade-output.md'
	},
	{
		number: 19,
		title: 'The fiduciary loop: the fiduciary gate',
		paragraphs: [
			'The fiduciary gate is derive-don’t-assert: it assembles a turn’s citations and deterministically buckets each into PASS / SUPPORTED / FAIL (provenance entries excluded). This is the engine layer beneath the answer-level trust pill you see in Donna — the pill summarises a whole turn; the gate buckets each individual citation.',
			'Honest caveat: chat vs autonomous verdict-tier parity gaps remain (DE-370 / DE-371). Illustrative walkthrough.'
		],
		playground: 'fiduciary-gate',
		sourceLabel: 'api/app/citation/gate.py',
		sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/api/app/citation/gate.py'
	},
	{
		number: 20,
		title: 'The fiduciary loop: the treatment layer',
		paragraphs: [
			'The treatment layer derives case-law validity signals — followed / distinguished / criticised — with a trace to each citing case, via a two-pass graph-then-judge derivation.',
			'Honest caveat: derived, not editorial — it is a signal to guide your reading, not an authoritative citator; judge snippets are never stored (P3) and carry a 30-day TTL. Illustrative walkthrough.'
		],
		playground: 'treatment-layer',
		sourceLabel: 'ADR 0019 — transparent validity / treatment layer',
		sourceUrl:
			'https://github.com/LegalQuants/lq-ai/blob/main/docs/adr/0019-transparent-validity-treatment-layer.md'
	},
	{
		number: 21,
		title: 'The fiduciary loop: the governed matter session',
		paragraphs: [
			'The capstone: a governed matter session runs plan → act → observe → replan over a closed tool set, under hard brakes and a per-phase step cap, orchestrating the authority / ledger / gate / treatment layers into one audited run.',
			'Honest caveat: the backend shipped, but there is no dedicated matter-intake UI yet — it reuses the autonomous session surface. Illustrative walkthrough.'
		],
		playground: 'matter-session-flow',
		sourceLabel: 'ADR 0020 — governed agentic legal matter sessions',
		sourceUrl:
			'https://github.com/LegalQuants/lq-ai/blob/main/docs/adr/0020-governed-agentic-legal-matter-sessions.md'
	}
```

- [ ] **Step 2:** Update `src/lib/about/lqLearnSections.test.ts`: change `toHaveLength(16)` → `toHaveLength(21)` and append the 5 slugs to the `PLAYGROUNDS` array in order (`authority-sources`, `citation-ledger`, `fiduciary-gate`, `treatment-layer`, `matter-session-flow`).
- [ ] **Step 3:** `npx vitest run src/lib/about/lqLearnSections.test.ts` → PASS (numbering 17–21, no `LQ.AI` dotted spelling, sourceUrls match).
- [ ] **Step 4:** Gates. **Step 5:** Commit `feat(fiduciary): add the 5 fiduciary playgrounds to the /about/lq-ai gallery`.

---

### Task 3: Per-section drill-downs on `/about/fiduciary`

**Files:** Modify `src/routes/(app)/about/fiduciary/+page.svelte`; Test `src/routes/(app)/about/fiduciary/page.svelte.test.ts`.

- [ ] **Step 1:** After each section's paragraph, add a drill-down link `<p>` (styled like the existing citation-engine-cascade link: `class="text-mlq-strong hover:underline"`, `target="_blank" rel="noopener noreferrer"`). Map:
  - After "The four trust states" iframe block → `fiduciary-gate` (frame: "See how the engine buckets each citation beneath these states").
  - After "The receipt & citation ledger" (`:73`) → `citation-ledger`.
  - After "Case treatment (validity)" (`:86`) → `treatment-layer`.
  - After "Matter sessions" (`:98`) → `matter-session-flow`.
  - After "Authoritative sources" (`:111`) → `authority-sources`.

  Each: `<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text"><a href="/learn/playgrounds/<slug>.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Explore an interactive walkthrough ↗</a></p>` — with a short lead-in clause tailored per section (e.g. gate: "The engine buckets each citation PASS / SUPPORTED / FAIL beneath the answer-level pill — <a…>explore the fiduciary gate ↗</a>").

- [ ] **Step 2:** Replace the closing "Under the hood" second paragraph ("Deeper interactive explorers … on the way … link to them as they ship.") with an honest illustrative-framing note:

```svelte
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The interactive walkthroughs linked above are <strong>illustrative</strong> — self-contained examples
	of how the LQ-AI engine works, not your live data — and each links onward to the real backend module
	or decision record it depicts.
</p>
```

- [ ] **Step 3:** Update `page.svelte.test.ts` — add assertions that the 5 drill-down links resolve (`container.querySelector('a[href="/learn/playgrounds/<slug>.html"]')` non-null for each of the 5 slugs) and that the stale "on the way"/"coming" phrasing is gone.
- [ ] **Step 4:** `npx vitest run "src/routes/(app)/about/fiduciary"` → PASS. **Step 5:** Gates. **Step 6:** Commit `feat(fiduciary): per-section playground drill-downs on /about/fiduciary`.

---

### Task 4: Live e2e

**Files:** Create `tests/fiduciary-playgrounds.spec.ts`.

- [ ] **Step 1:** Rebuild `donna-web` (`docker compose up -d --build donna-web`).
- [ ] **Step 2:** e2e: login → `/about/fiduciary` → assert each of the 5 drill-down links is present with the right href; click the `citation-ledger` link (opens `/learn/playgrounds/citation-ledger.html` in a new tab) and assert the playground page loads (e.g. its `↩ Learn` link or a known heading is visible). Also load `/about/lq-ai` and assert the `matter-session-flow` iframe is present. Self-contained (no seed).

```ts
import { test, expect, type Page } from '@playwright/test';
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}
const SLUGS = [
	'authority-sources',
	'citation-ledger',
	'fiduciary-gate',
	'treatment-layer',
	'matter-session-flow'
];
test('the 5 fiduciary playgrounds are wired and load', async ({ page }) => {
	await login(page);
	await page.goto('/about/fiduciary');
	for (const s of SLUGS)
		await expect(page.locator(`a[href="/learn/playgrounds/${s}.html"]`).first()).toBeVisible();
	// The vendored playground itself loads.
	const resp = await page.goto('/learn/playgrounds/citation-ledger.html');
	expect(resp?.ok()).toBeTruthy();
	await expect(page.getByRole('link', { name: /Learn/ }).first()).toBeVisible();
});
```

- [ ] **Step 3:** `set -a; . ./.env; set +a; npx playwright test tests/fiduciary-playgrounds.spec.ts` → PASS. **Step 4:** Gates. **Step 5:** Commit `test(fiduciary): live e2e for the wired fiduciary playgrounds`.

---

### Task 5: Whole-branch review, PR, merge, mirror

- [ ] Opus whole-branch review (focus: honest illustrative framing; per-citation-vs-per-turn not conflated; no forbidden overclaim; links resolve to vendored files; no pin bump).
- [ ] PR to `main` with a **merge commit**; mirror `main` to `tucuxi`.

## Self-Review

- Vendor 5 files (Task 1) · gallery registration (Task 2) · per-section drill-downs + illustrative framing (Task 3) · e2e (Task 4) · review (Task 5). ✅
- Slugs consistent across tasks: `authority-sources`, `citation-ledger`, `fiduciary-gate`, `treatment-layer`, `matter-session-flow`. ✅
- No pin bump; source SHA `0766164` recorded. Honest framing + per-citation/per-turn distinction carried. ✅
