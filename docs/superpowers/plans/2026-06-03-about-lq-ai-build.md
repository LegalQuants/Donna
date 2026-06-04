# Powered by LQ-AI "How to Build" (slice 2b-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated `/about/lq-ai/build` "How to Build" page (re-skinned), copy its 2 playgrounds, cross-link it with the How-It-Works page, and hide the callout on the build sub-page.

**Architecture:** Pure-frontend SvelteKit. A new `/about/lq-ai/build/+page.svelte` ports LQ-AI's contributor "How to Build" tab natively in `mlq-*` (faithful on the durable sections; the repo-specific mini-PRDs + CI-gate sections condensed to a lead-in + repo link). Two more static playgrounds (`skill-format`, `test-landscape`) complete the set. One-line layout fix + a cross-link on the How-It-Works page. No backend/BFF/vendor change.

**Tech Stack:** SvelteKit 2 / Svelte 5, Tailwind `mlq-*`, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-03-about-lq-ai-build-design.md`
**Source to port:** `vendor/lq-ai/web/src/routes/lq-ai/learn/build/+page.svelte` (599 lines).

---

### Task 1: Copy the 2 remaining playgrounds into `static/`

**Files:** Create `static/learn/playgrounds/skill-format.html`, `static/learn/playgrounds/test-landscape.html`

- [ ] **Step 1: Copy**

```bash
for f in skill-format test-landscape; do
  cp "vendor/lq-ai/web/static/learn/playgrounds/$f.html" "static/learn/playgrounds/$f.html"
done
ls static/learn/playgrounds/ | grep -c '\.html'   # expect 18 now
```

- [ ] **Step 2: Verify** both new files exist and are non-trivial: `wc -l static/learn/playgrounds/skill-format.html static/learn/playgrounds/test-landscape.html`. Confirm they're verbatim: `diff -q vendor/lq-ai/web/static/learn/playgrounds/skill-format.html static/learn/playgrounds/skill-format.html` → identical.

- [ ] **Step 3: Commit**

```bash
git add static/learn/playgrounds/skill-format.html static/learn/playgrounds/test-landscape.html
git commit -m "feat(about): copy skill-format + test-landscape playgrounds (completes all 18)"
```

---

### Task 2: Hide the callout on `/about/lq-ai/*`

**Files:** Modify `src/routes/(app)/about/+layout.svelte`

The callout currently hides only on the exact `/about/lq-ai`. The new build sub-page should also hide it.

- [ ] **Step 1: Change the `showCallout` derivation**

Replace:
```svelte
  const showCallout = $derived(page.url.pathname !== '/about/lq-ai');
```
with:
```svelte
  const showCallout = $derived(!page.url.pathname.startsWith('/about/lq-ai'));
```
(Leave `wide` as-is — it already uses `startsWith('/about/lq-ai')`, so `/about/lq-ai/build` gets `max-w-6xl`.)

- [ ] **Step 2: Gate** — `npm run check` (0/0), `npx eslint "src/routes/(app)/about/+layout.svelte"` (clean).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/about/+layout.svelte"
git commit -m "fix(about): hide the Powered-by callout on all /about/lq-ai/* pages"
```

---

### Task 3: Create the `/about/lq-ai/build` page (curated port)

Port LQ-AI's "How to Build" page natively. **Read the source first**:
`vendor/lq-ai/web/src/routes/lq-ai/learn/build/+page.svelte`. Faithfully port the durable sections;
**condense** sections 3 (mini-PRDs) and 4 (CI gates) per the spec. Normalize `LQ.AI`→`LQ-AI`.

**Files:** Create `src/routes/(app)/about/lq-ai/build/+page.svelte` (a new sub-route under the existing `/about/lq-ai`).

- [ ] **Step 1: Scaffold the page** with the head, back-link, h1, and intro (this part is fully specified; fill the sections in Step 2):

```svelte
<svelte:head><title>How to Build — Powered by LQ-AI — About Donna</title></svelte:head>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back to how-it-works -->
<a href="/about/lq-ai" class="mb-4 inline-block text-sm text-mlq-strong hover:underline">← How it works</a>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI — How to Build</h1>

<p class="mb-6 max-w-prose text-sm leading-relaxed text-mlq-text">
  Everything you need to go from curious to contributor — whether you're a practicing attorney, a
  security engineer, or a developer looking for a well-scoped first PR.
</p>

<!-- sections go here (Step 2) -->
```

- [ ] **Step 2: Add the sections.** Use these heading + prose conventions throughout: section heading
`<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">…</h2>`, prose
`<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">…</p>`, lists
`<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">`. For external repo links use a static
`<a href="https://github.com/…" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">label</a>`
(no eslint-disable needed for static external hrefs). Build the sections:

  - **The contribution path** — port the source §1 prose faithfully (GitHub Issues vs PRs; the
    `CONTRIBUTING.md` link; the mini-PRD "Definition of merged" contract sentence).
  - **Contribute a skill** — port source §2: the prose ("Skills are the canonical artifact of value…");
    the **4-step flow** (Claim · Draft · Attest · Review) as native step rows — use this markup,
    porting each step's text from the source:
    ```svelte
    <ol class="mb-4 space-y-2">
      <li class="flex gap-3 text-sm text-mlq-text">
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">1</span>
        <span><strong>Claim.</strong> … (port from source) …</span>
      </li>
      <!-- repeat for 2 Draft, 3 Attest, 4 Review -->
    </ol>
    ```
    the skill repo links (`skills/CONTRIBUTING.md`, `docs/skill-authoring-guide.md`,
    `skill-acceptance-tests mini-PRD`) as a small link cluster; then the **Skill Format Explorer**
    playground block (full code below).
  - **Skill Format Explorer playground** (inside the Contribute-a-skill section), full code:
    ```svelte
    <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
      <strong>Try it out: Skill Format Explorer.</strong> Experiment with the SKILL.md format below; the
      validation rules mirror the live backend.
    </p>
    <iframe
      src="/learn/playgrounds/skill-format.html"
      title="Skill Format Explorer — SKILL.md editor and validation"
      loading="lazy"
      class="mt-1 h-[900px] w-full rounded-mlq-control border border-mlq-subtle"
    ></iframe>
    <div class="mt-2 text-xs text-mlq-muted">
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
      <a href="/learn/playgrounds/skill-format.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Open full-screen ↗</a>
    </div>
    ```
  - **Curated mini-PRDs** — **CONDENSE** to ~2 sentences + a repo link. Suggested:
    "LQ-AI maintains a set of curated, shortest-path contributions — each with explicit acceptance
    criteria and a contributor profile, so you can start with the same information the maintainers have."
    + link to the repo (`https://github.com/LegalQuants/lq-ai` or its `docs/proposals` / mini-PRDs path
    if present in the source's links). Do NOT reproduce the 7-item list or effort estimates.
  - **Before you open a PR** — **CONDENSE** to ~2 sentences (tests + docs + reviews must pass) + the
    `CONTRIBUTING.md` link + two full-screen playground links:
    ```svelte
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
    <a href="/learn/playgrounds/test-landscape.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Test landscape: what must pass ↗</a>
    ```
    (and optionally a similar link to `/learn/playgrounds/otel-eval.html` labelled "Observability trace explorer ↗").
    Do NOT reproduce exact CI commands.
  - **Anatomy of an aligned agentic flow** — port source §5 faithfully (durable + inspiring).
  - **The roadmap** — port source §6's brief roadmap summary.
  - **GitHub** — port source §7's repo link cluster (the project + CONTRIBUTING etc.) as a final
    paragraph/links block.

- [ ] **Step 3: Gate** — `npm run check` (0/0), `npx eslint "src/routes/(app)/about/lq-ai/build/+page.svelte"` (clean — every internal/dynamic `<a>`/iframe-sibling link must carry the eslint-disable comment; static external github links do not), `npx vitest run` (green).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/about/lq-ai/build/+page.svelte"
git commit -m "feat(about): curated How to Build page (/about/lq-ai/build)"
```

---

### Task 4: Cross-link from How It Works → How to Build

**Files:** Modify `src/routes/(app)/about/lq-ai/+page.svelte`

Add a prominent "How to build" link just before the closing "Explore the project" paragraph of the
Build & Learn section.

- [ ] **Step 1: Insert the link block** immediately before the final `<p class="max-w-prose text-sm text-mlq-muted">Explore the project: …</p>`:

```svelte
  <p class="mb-4 max-w-prose text-sm leading-relaxed text-mlq-text">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- to how-to-build -->
    <a href="/about/lq-ai/build" class="font-medium text-mlq-strong hover:underline">How to build on LQ-AI →</a>
    — the contribution path, skill authoring (with an interactive SKILL.md explorer), and the roadmap.
  </p>
```

- [ ] **Step 2: Gate** — `npm run check` (0/0), `npx eslint "src/routes/(app)/about/lq-ai/+page.svelte"` (clean).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/about/lq-ai/+page.svelte"
git commit -m "feat(about): link How It Works → How to Build"
```

---

### Task 5: e2e + live verification

**Files:** Modify `tests/about.spec.ts`

- [ ] **Step 1: Add a test** (after the existing lq-ai test):

```ts
test('How It Works links to How to Build, which renders the Skill Format playground', async ({ page }) => {
  await login(page);
  await page.goto('/about/lq-ai');

  await page.getByRole('link', { name: /how to build on LQ-AI/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai\/build$/);
  await expect(page.getByRole('heading', { name: /How to Build/i, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Contribute a skill/i })).toBeVisible();
  await expect(page.locator('iframe[src="/learn/playgrounds/skill-format.html"]')).toHaveCount(1);

  // Back-link returns to How It Works.
  await page.getByRole('link', { name: /← How it works/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai$/);
});
```

> The `Contribute a skill` heading assertion matches whatever exact heading the implementer used for
> source §2 ("Want to contribute a skill? Start here." or a shortened "Contribute a skill"). If the
> implementer shortens it, keep the word "skill" so this regex matches — or adjust the regex to the
> chosen heading. Ensure the chosen §2 heading contains "skill".

- [ ] **Step 2: Gate** — `npm run check` (0/0).

- [ ] **Step 3: Commit**

```bash
git add tests/about.spec.ts
git commit -m "test(about): e2e — How It Works → How to Build + skill-format playground"
```

- [ ] **Step 4: Live verification (controller-run)**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web    # wait for healthy
npx playwright test about.spec.ts         # all About specs
# spot-check both new playgrounds serve:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:13002/learn/playgrounds/skill-format.html     # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:13002/learn/playgrounds/test-landscape.html   # 200
```
Expected: all About e2e green; both 200.

---

## Notes for the executor
- **Gate bar:** `npm run check` = 0/0. No new eslint errors — internal/dynamic `<a href>` + the
  playground-link siblings need the `eslint-disable-next-line svelte/no-navigation-without-resolve`
  comment; static external `https://github.com/...` links do NOT.
- **Curated, not verbatim:** faithfully port §1, §2 (+ playground), §5, §6, §7; condense §3 and §4 to a
  lead-in + repo/CONTRIBUTING links + the two full-screen playground links. Don't reproduce the 7
  mini-PRDs or exact CI commands. Normalize `LQ.AI`→`LQ-AI`.
- **Do not** modify the 16 How-It-Works sections (only Task 4's cross-link is added to that page), the
  copied playground files, or any `vendor/`/backend code.
- After execution: whole-branch Opus review, then `finishing-a-development-branch` → PR.
