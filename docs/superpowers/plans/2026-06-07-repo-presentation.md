# Repo Presentation (docs-polish PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo a product-grade front page: README rewrite with hero screenshot, LICENSE (Apache 2.0), acknowledgements with the verbatim credit, root cleanup, and a working prettier (config fix + one-time repo format).

**Architecture:** Pure docs/config work plus one mechanical repo-wide format commit. No app behavior changes — the format commit is verified by the full unit suite + svelte-check + an e2e subset. Order matters: cleanup → LICENSE → prettier (so later-written files land on the formatted base) → screenshot → README → verification.

**Tech Stack:** prettier 3 (+ svelte & tailwindcss plugins), Playwright (screenshot), GitHub-flavored markdown.

**Spec:** `docs/superpowers/specs/2026-06-06-docs-polish-design.md` (PR 2 half) + user decision 2026-06-07: prettier = fix path AND one-time `--write` commit + `.git-blame-ignore-revs`. Branch: `docs/repo-presentation`. Commit + push per task.

**Facts verified at plan time:**

- `.prettierrc` `tailwindStylesheet` points at nonexistent `./src/routes/layout.css`; the real Tailwind entry is **`./src/app.css`** (`@import 'tailwindcss'`). With the path fixed, `npx prettier --check .` reports **691 files** (prettier has never successfully run).
- `.prettierignore` already excludes `/vendor/`, `/static/`, `/src/lib/api/`, lockfiles.
- The two root scope docs (`mikeossfrontendscope.md`, `mikeossuxbreakdown.md`) are referenced ONLY by dated historical docs (`docs/superpowers/HANDOFF-P2b.md`, `docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md`) — those are point-in-time records and must NOT be edited.
- No `.github/` (no CI badges for the README).
- `package.json` has `"private": true` and no `license` field.

---

### Task 1: Root cleanup — move the MikeOSS research docs

**Files:**

- Move: `mikeossfrontendscope.md` → `docs/research/mikeossfrontendscope.md`
- Move: `mikeossuxbreakdown.md` → `docs/research/mikeossuxbreakdown.md`

- [ ] **Step 1: Move with history**

```bash
mkdir -p docs/research
git mv mikeossfrontendscope.md docs/research/
git mv mikeossuxbreakdown.md docs/research/
```

- [ ] **Step 2: Confirm no live references break**

Run: `grep -rn "mikeossfrontendscope\|mikeossuxbreakdown" --include="*.md" --include="*.ts" --include="*.svelte" . --exclude-dir=node_modules --exclude-dir=vendor | grep -v "^./docs/research/"`
Expected: hits ONLY in `docs/superpowers/HANDOFF-P2b.md`, `docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md`, and `docs/superpowers/specs/2026-06-06-docs-polish-design.md` — all dated historical records; leave them untouched.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: move MikeOSS research notes from root to docs/research/"
git push
```

---

### Task 2: LICENSE (Apache 2.0) + package.json license field

**Files:**

- Create: `LICENSE`
- Modify: `package.json` (top-level fields)

- [ ] **Step 1: Create `LICENSE`** with the **unmodified** Apache License 2.0 text. Fetch the canonical text:

```bash
curl -s https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE
```

Then in the appendix's copyright line area, nothing needs editing — the canonical file ships with the `[yyyy] [name of copyright owner]` boilerplate inside the appendix instructions (leave the body verbatim). Add the actual copyright notice by **prepending nothing** — instead verify the file is byte-identical to the canonical text:

```bash
shasum LICENSE   # record it; the file must be the standard text
head -3 LICENSE  # "                                 Apache License" / "                           Version 2.0, January 2004"
```

Note: Apache-2.0 convention keeps LICENSE pristine; the copyright holder is declared in NOTICE or in the README/license section. We declare it in the README's License section (Task 5: "Copyright 2026 LegalQuants").

- [ ] **Step 2: Add the license field** — in `package.json`, after `"version"`:

```json
"version": "0.0.1",
"license": "Apache-2.0",
```

- [ ] **Step 3: Sanity check**

Run: `node -e "console.log(require('./package.json').license)"`
Expected: `Apache-2.0`
Run: `npm run check`
Expected: 0 ERRORS / 0 WARNINGS (vendor `ERR_MODULE_NOT_FOUND` stderr harmless).

- [ ] **Step 4: Commit**

```bash
git add LICENSE package.json
git commit -m "chore: add Apache-2.0 LICENSE + package.json license field"
git push
```

---

### Task 3: Fix prettier config + one-time repo format

**Files:**

- Modify: `.prettierrc` (tailwindStylesheet path)
- Modify: ~691 files (mechanical `prettier --write`)
- Create: `.git-blame-ignore-revs`

⚠️ This is THREE separate commits: (a) config fix, (b) the big format, (c) blame-ignore file. Keep them separate.

- [ ] **Step 1: Fix the stylesheet path** — in `.prettierrc` change:

```json
"tailwindStylesheet": "./src/routes/layout.css",
```

to:

```json
"tailwindStylesheet": "./src/app.css",
```

- [ ] **Step 2: Verify prettier now runs (no crash)**

Run: `npx prettier --check src/lib/about/AboutRail.svelte; echo "exit=$?"`
Expected: a `[warn]` line (or clean) and exit 1 or 0 — NOT the previous `ENOENT ... src/routes/layout.css` crash.

- [ ] **Step 3: Commit the config fix alone**

```bash
git add .prettierrc
git commit -m "fix(lint): prettier tailwindStylesheet pointed at nonexistent src/routes/layout.css"
git push
```

- [ ] **Step 4: Run the one-time format**

```bash
npx prettier --write .
```

Expected: ~691 files rewritten. Then verify NOTHING semantic broke:

Run: `npm run check`
Expected: 0 ERRORS / 0 WARNINGS.
Run: `npx vitest run`
Expected: ALL tests pass (was 1183 at branch time).
Run: `npm run lint`
Expected: prettier section passes ("All matched files use Prettier code style!"); eslint reports its ~55 pre-existing errors — record the exact count, it must NOT exceed the count on `main` (`git stash && npx eslint . | tail -1 && git stash pop` if you need the baseline; it was 55).

⚠️ If `npm run check` or vitest FAILS after formatting: identify the file, restore just that file (`git checkout -- <file>`), add it to `.prettierignore` with a comment, and report it as a concern. Do NOT hand-edit formatted output.

- [ ] **Step 5: Commit the format (one commit, nothing else mixed in)**

```bash
git add -A ':!vendor'
git commit -m "style: one-time prettier format of the repo (config was broken since scaffold)"
git push
```

- [ ] **Step 6: Add `.git-blame-ignore-revs`** with the format commit's full SHA:

```bash
FORMAT_SHA=$(git rev-parse HEAD)
cat > .git-blame-ignore-revs <<EOF
# One-time repo-wide prettier format (prettier config had been broken since scaffold).
# Use: git config blame.ignoreRevsFile .git-blame-ignore-revs
$FORMAT_SHA
EOF
git add .git-blame-ignore-revs
git commit -m "chore: blame-ignore the one-time prettier format commit"
git push
```

---

### Task 4: Hero screenshot

**Files:**

- Create: `docs/images/donna-hero.png`

The hero should show Donna's signature view: **a chat with character-verified citation pills, ideally with the document panel open**. The dev DB persists prior e2e artifacts, so an existing chat with citations may already be available — prefer that over seeding a new one.

- [ ] **Step 1: Stack up + rebuild web** (required: stale container serves the old bundle)

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```

- [ ] **Step 2: Capture.** Write a throwaway script at `node_modules/.hero-shot.mjs` (module resolution requires it to live under the repo; delete after):

```js
import { chromium } from '@playwright/test';
const BASE = process.env.DONNA_BASE_URL || 'http://localhost:13002';
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2
});
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', process.env.DONNA_E2E_EMAIL);
await page.fill('input[name="password"]', process.env.DONNA_E2E_PASSWORD);
await page.click('button:has-text("Sign in")');
await page.waitForURL(`${BASE}/`);
// Find an existing chat that has citation pills (e2e artifacts persist in the dev DB).
// Strategy: open recent chats from the sidebar, look for `.cite-tab` elements.
// (Adapt selectors by reading the sidebar markup; chats list is in the left sidebar.)
// When a chat with pills is found: click the first pill to open the document panel,
// wait for the PDF render, then screenshot.
// Fallback if none found: seed one — follow tests/citation-live.spec.ts (create matter+KB,
// upload tests/fixtures PDF, wait for ingest, ask the question it asks, wait for pills).
await page.screenshot({ path: 'docs/images/donna-hero.png' });
await browser.close();
```

This script is a SKELETON — you must adapt the chat-finding logic by reading the actual sidebar markup (`src/lib/components/Sidebar.svelte` / the chats list component) and `tests/citation-live.spec.ts` for the seeding fallback. Requirements for the final image:

- Shows an assistant answer with **citation pills** visible; document panel open beside it if achievable.
- No half-rendered/streaming state (wait for completion), no error toasts visible.
- 1440×900 @2x (2880×1800 px file), PNG, saved to `docs/images/donna-hero.png`.
- `mkdir -p docs/images` first; delete the throwaway script after.

- [ ] **Step 3: Eyeball it** — open the PNG (Read tool renders images) and confirm: pills visible, layout clean, no secrets (the admin email `admin@lq.ai` in the UI is fine; no API keys on screen).

- [ ] **Step 4: Commit**

```bash
git add docs/images/donna-hero.png
git commit -m "docs: hero screenshot for the README"
git push
```

---

### Task 5: README rewrite

**Files:**

- Rewrite: `README.md`

Replace the whole file with the draft below, THEN fact-check every command and path against the repo (the draft was written from the current README's verified setup steps — re-verify nothing drifted), THEN `npx prettier --write README.md` before committing.

- [ ] **Step 1: Write the new README.md:**

````markdown
# Donna

**A friendly, document-forward frontend for the [LQ.AI](https://github.com/LegalQuants/lq-ai) legal-AI backend** — conversational legal work with character-verified citations, transparent receipts, and autonomous runs, under a clean reading-first interface inspired by [MikeOSS](https://github.com/willchen96/mike).

![Donna — chat with character-verified citations and the document panel](docs/images/donna-hero.png)

Donna is a standalone SvelteKit app that talks to the lq-ai backend only through its published API, and vendors that backend (as a pinned git submodule) so the whole product runs together with one compose file.

## What's inside

- **Assistant chat** with streaming answers and **character-verified citation pills** — hover for the source quote, click to open the document panel jumped to the exact cited passage. A per-turn **receipts drawer** shows every retrieval, inference, and skill event behind an answer, including whether anonymization was applied.
- **Matters (projects)** — scope chats to a matter with files, linked knowledge bases, attached skills, and free-form context; privileged matters enforce a minimum inference tier in the composer.
- **Knowledge bases** — create, link, upload; documents auto-ingest for retrieval (RAG) with live status, hybrid-search tuning, and per-file download.
- **Workflows hub** — four kinds of reuse:
  - **Skills**: reusable instruction blocks with typed inputs; author your own or fork built-ins, attach them per-message (slash aliases supported).
  - **Playbooks**: negotiation positions applied to a contract → verdict scorecard + consolidated redline view; generate a draft playbook from your own documents.
  - **Prompts**: saved snippets inserted at the cursor.
  - **Automations**: runs Donna executes on its own — run-now, cron schedules, and KB-arrival watches — each leaving a transparency receipt (phases, tool calls, cost, terminal reason) plus its results (findings and proposed memories), with a notifications inbox.
- **Tabular review** — the same questions across many documents → a cited, confidence-scored grid; per-column model-tier floors and ensemble verification; Excel/CSV export.
- **Redlines** — consolidated change-set view of a playbook run with severity-ordered margin notes.
- **Settings** — account & security, data export / scheduled deletion, preferences (incl. ambient trust pills), a read-only trust matrix, and model management: per-category routing, installed local (Ollama) models, and **bring-your-own provider keys** (admin, hot-applied, write-only).
- **Prompt enhance** on every composer, **file attach** in chat, and an in-app guide at **/about** — including interactive playgrounds explaining how the LQ-AI engine works.

## Architecture (one paragraph)

The browser talks only to Donna's SvelteKit server (a **backend-for-frontend**). The SvelteKit server holds the lq-ai JWT access + refresh tokens in **httpOnly cookies**, attaches `Authorization: Bearer` when proxying to the lq-ai `api`, and transparently refreshes on `401`. This means no CORS, and the JWT never reaches client JavaScript. The lq-ai backend is vendored at `vendor/lq-ai` (pinned submodule) and brought up by this repo's `docker-compose.yml`, which `include`s lq-ai's compose and adds Donna's web service (`donna-web`).

## Prerequisites

- **Docker** + Docker Compose v2 (for the bundled backend).
- **Node 22+** (for local dev / tooling).

## Setup

```bash
# 1. Clone WITH submodules (pulls vendor/lq-ai)
git clone --recurse-submodules https://github.com/LegalQuants/Donna.git
cd Donna
#    (if already cloned without submodules:)
git submodule update --init --recursive

# 2. Install deps
npm install

# 3. Generate the typed API client from lq-ai's OpenAPI specs
npm run gen:api

# 4. Create your env file (dev secrets + host ports)
cp .env.example .env
#    Edit .env: set the required secrets (POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD,
#    S3_*, LQ_AI_GATEWAY_KEY, JWT_SECRET). The *_HOST_PORT values are pre-shifted
#    so Donna can run ALONGSIDE a separate lq-ai dev stack on the default ports.
```

## Run the full stack

Donna runs as its own compose project (`donna`) on **shifted host ports**, so it won't collide with a separate lq-ai dev stack running on the defaults:

```bash
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```

With the default `.env`, Donna is then at **http://localhost:13002** (the lq-ai `api` is at `http://localhost:18000`). The `ingest-worker` powers document ingestion/RAG and data export; the `arq-worker` powers tabular runs, playbook generation, and automations.

> **Deploying beyond localhost:** the production build sets session cookies with the `Secure` flag, which browsers only store over HTTPS (with a `localhost` exemption). Any non-`localhost` deployment must terminate TLS in front of `donna-web`, or login will silently fail (cookies dropped).

> **Why not `docker compose up` (everything)?** Compose v2 `include:` won't let us override lq-ai's `web` service, so it still exists in the merged spec. Starting the explicit service list above avoids building/running it.

### First-run admin (login-ready fixture)

On first boot the api auto-creates an admin (`admin@lq.ai`) with a random password and `must_change_password=true` (printed to the api logs). For a directly-usable login (dev/test), set a known password and clear the change-password flag with lq-ai's CLI:

```bash
docker compose exec api python -m app.cli reset-admin-password \
  --email admin@lq.ai --password 'DonnaE2ePassw0rd!' --no-force-change
```

Then sign in at http://localhost:13002 with `admin@lq.ai` / `DonnaE2ePassw0rd!`. (To exercise the real first-run flow instead, retrieve the printed password with `docker compose logs api 2>&1 | grep "First-run admin password"` and you'll be routed through the change-password screen.)

## Verify

```bash
npm run check        # svelte-check — 0 errors, 0 warnings
npm run lint         # prettier + eslint
npx vitest run       # unit/component tests
npx playwright test  # e2e — requires the stack up + the admin fixture above
```

The e2e reads `DONNA_BASE_URL`, `DONNA_E2E_EMAIL`, `DONNA_E2E_PASSWORD` from `.env` (or the environment).

> Running `npm run check` prints a harmless `ERR_MODULE_NOT_FOUND` referencing `vendor/lq-ai/...`; svelte-check recovers and the run still reports `0 ERRORS` and exits 0. The vendored backend is excluded from svelte-check/ESLint/Prettier.

## Development (without Docker for the frontend)

```bash
LQ_API_INTERNAL_URL=http://localhost:18000 npm run dev
```

## Layout

```
src/                  SvelteKit app (routes, lib, BFF server code, hooks)
src/lib/server/       server-only: session cookies, authed lqClient, auth wrappers
src/lib/api/          generated OpenAPI types (npm run gen:api)
vendor/lq-ai/         pinned lq-ai backend (git submodule)
docs/                 specs, plans, decisions, upstream requests, research notes
tests/                Playwright e2e
static/learn/         interactive playgrounds served by the /about guide
```

Design specs and implementation plans for every shipped phase live under `docs/superpowers/`; the lq-ai submodule pin log is `docs/decisions/lq-ai-pin.md`. The richest documentation, though, is in the app itself: sign in and open **/about**.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Copyright 2026 LegalQuants.

## Acknowledgements

- **[LQ.AI](https://github.com/LegalQuants/lq-ai)** — the legal-AI engine Donna fronts: retrieval, the character-verified citation engine, anonymization, skills/playbooks, tabular review, and the autonomous runtime.
- **[MikeOSS](https://github.com/willchen96/mike)** — the design inspiration for Donna's reading-first, document-forward interface.
- Built with [SvelteKit](https://kit.svelte.dev), [Tailwind CSS](https://tailwindcss.com), and [Claude Code](https://claude.com/claude-code).

> Donna and LQ.AI were initially authored by Kevin Keller and contributed to LegalQuants.
> Comments, corrections, and contributions welcomed via GitHub.
````

- [ ] **Step 2: Fact-check the draft against the repo** before committing:
  - Every command runs verbatim (Task 6 re-runs them; here just sanity-read `package.json` scripts and `.env.example` for the variable names).
  - The feature-tour claims match shipped surfaces (each bullet maps to a route you can list: `/`, `/matters`, `/knowledge`, `/workflows`, `/skills`, `/playbooks`, `/prompts`, `/automations`, `/tabular`, `/settings/*`, `/about`).
  - The MikeOSS link `https://github.com/willchen96/mike` matches the old README's link target.
  - The verbatim credit is EXACTLY: "Donna and LQ.AI were initially authored by Kevin Keller and contributed to LegalQuants. Comments, corrections, and contributions welcomed via GitHub." (rendered as the blockquote above).
- [ ] **Step 3: Format + verify**

```bash
npx prettier --write README.md
npx prettier --check README.md
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: product-forward README rewrite — feature tour, hero, license, acknowledgements"
git push
```

---

### Task 6: Full verification

**Files:** none (verification + fixes only)

- [ ] **Step 1: Re-run every README command verbatim** (in a scratch sense — don't re-clone, but run: `npm run gen:api` (idempotent), `npm run check`, `npm run lint` (must be FULLY green now: prettier passes + eslint ≤ baseline 55), `npx vitest run` (all pass), and confirm the compose service list matches `docker compose config --services`.
- [ ] **Step 2: Link check** — for every relative link/image in README.md (`docs/images/donna-hero.png`, `LICENSE`, `docs/decisions/lq-ai-pin.md`), `ls` the target. For the three external links (lq-ai repo, MikeOSS repo, SvelteKit/Tailwind/Claude Code), `curl -s -o /dev/null -w "%{http_code}" <url>` → 200/301.
- [ ] **Step 3: Render check** — view README.md (markdown) top to bottom: headings hierarchy sane, image path correct, code blocks tagged, blockquote credit renders.
- [ ] **Step 4: e2e smoke on the formatted codebase** (the format commit touched ~691 files):

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/about.spec.ts tests/auth-and-landing.spec.ts tests/skills-authoring.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit any fixes; push.**

---

## After the plan completes

Outer-loop (NOT plan tasks): whole-branch review → PR `docs/repo-presentation` → user merges → **docs-polish milestone complete**. Still pending elsewhere: the upstream artifacts SHA (interrupt protocol per the spec) and the scheduled-skill-registry recheck.
