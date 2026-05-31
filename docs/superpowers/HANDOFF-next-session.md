# Donna — Handoff for the next session

**Date:** 2026-05-31 · **Branch state:** everything below is **merged to `main`** (this handoff PR merged too). Start from a clean `main`.

## Where we are

**P0–P4 complete and merged.** **P5 Workflows is nearly complete** — all three legs shipped:
- **Skills authoring** (#21) + landing skill-attach (#22) + applied-skills confirmation (#24).
- **Playbooks** — A browse (#25), B apply (#26), C easy-gen wizard (#27), D manual authoring + full position editor (#28).
- **Saved Prompts** (#29) — `/prompts` management page + composer **Prompts** popover (insert-at-cursor + save-current-draft), backed by `/prompts/items*` BFF proxies + a `promptLibrary` rune controller.

Full per-slice detail lives in the `donna-phase-status` project memory. Spec/plan artifacts are under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## What's next: P5-3.5 — Unified Workflows IA (recommended next slice)

The P5 roadmap deliverable is "**Unified** Skills + Playbooks + Saved Prompts IA with transparency surfaces." Skills, Playbooks, and Prompts each shipped as their **own** top-level sidebar entry + route. The remaining P5 work is to **unify** them.

**Current state to build on:**
- `src/routes/(app)/workflows/+page.svelte` is a **stub** ("Coming in a later phase").
- The sidebar (`src/lib/components/Sidebar.svelte`) currently lists **four** separate entries: `Workflows` (stub), `Skills`, `Playbooks`, `Prompts` (plus Assistant, Projects, Tabular).

**This is a fresh feature → start with the brainstorming skill.** It's a genuinely open design question — bring it through brainstorm → spec → plan. Key decisions to surface in brainstorming (don't pre-decide):
- **What does "unify" mean here?** Options to explore: (a) build `/workflows` into a **hub landing page** that links to/embeds Skills + Playbooks + Prompts (cards/sections), keeping the three sub-routes but collapsing the sidebar to a single "Workflows" entry with sub-nav; (b) a lighter touch — keep the routes, just make `/workflows` a real index; (c) full consolidation under `/workflows/{skills,playbooks,prompts}`. Weigh against Donna's minimal-chrome thesis (see `donna-product-direction` memory) and the cost of moving merged routes (redirects, updating sidebar tests + any in-app links).
- **"Transparency surfaces"** — what the roadmap meant (e.g. surfacing which skills/playbooks/prompts are in play, usage, provenance). Clarify scope with the user; likely a later concern, don't over-build.
- **Sidebar consolidation** — four entries → one "Workflows" with sub-items, or keep flat? a11y + active-state.

Scope it as a PR-sized slice. If it's large, decompose (e.g. hub page first, sidebar consolidation second).

## Cold start (every session)

1. `git checkout main && git pull` (this handoff is merged).
2. Bring the stack up (shifted ports; coexists with the user's own lq-ai). `arq-worker` only matters for playbooks easy-gen, but bring it up anyway:
   ```bash
   set -a; . ./.env; set +a
   docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
   ```
   App at http://localhost:13002. Login fixture `admin@lq.ai` / `$DONNA_E2E_PASSWORD`. Details in `donna-dev-stack` memory + `README.md`.
3. Verify gate: `npm run check` (expect "0 errors and 0 warnings"; vendor `ERR_MODULE_NOT_FOUND` stderr is harmless) · `npx vitest run` (expect ~652 green) · live e2es via `set -a; . ./.env; set +a; npx playwright test`.

## The build loop (established, working well)

brainstorm (`superpowers:brainstorming`, one question at a time, AskUserQuestion) → spec (`docs/superpowers/specs/`) → plan (`superpowers:writing-plans`, TDD, full code per task) → execute (`superpowers:subagent-driven-development`: fresh implementer subagent per task + **two-stage review — spec compliance, then code quality** — fix loops, commit per task) → final whole-branch review (opus) → `superpowers:finishing-a-development-branch` → **PR into `main`** → update memory.

Conventions enforced every task: TDD; `npm run check` 0/0; eslint clean (no `any`); in-app `<a>`/`goto` need the `svelte/no-navigation-without-resolve` disable comment; server tests `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`; component tests `@testing-library/svelte` + `render(C, { props })`; modal a11y mirrors `ReceiptsDrawer`/skills; live e2es self-clean. Feature work goes on a dedicated branch off `main`, never commit features to `main`.

## Other remaining work (backlog, not the next slice)

- **Skill-inputs composer form** — P5 item, **upstream-blocked**: `skill_inputs` is a no-op for built-in skills (gateway assembler drops unreferenced bound inputs). Request written: `docs/upstream-requests/lq-ai-skill-inputs-corpus.md`. **Relay to the LQ_AI claude-code session → merge → bump the `vendor/lq-ai` pin → `npm run gen:api` → build the composer input-form slice.**
- **Chat-level file attach** — **upstream-blocked**: `MessageCreate` has no `file_ids`, no `POST /chats/{id}/files`. Request drafted (branch `docs/upstream-chat-file-attach`). The user is relaying this to the LQ_AI session.
- **P4 upstream-blocked leftovers** — matter folder-tree, file versions, project sharing/ACL (absent from the generated backend types at P4 recon).
- **Future phases:** P6 Tabular review (doc×column grid, per-cell citations, export) · P7 Settings/Account/Trust (profile, tier visibility, export/deletion, Trust page) · P8 TipTap redline pane (read-only tracked-changes editor).
- **Pre-existing test debt:** `tests/citation-pills.spec.ts` + `tests/citation-live.spec.ts` fail on `main` (obsolete P2b-era `role="dialog"` assertions after P3-2 made the citation pill hover-only). Update to hover-based assertions or delete the obsolete coverage — cleanable any time.
- **Saved Prompts minor follow-up (non-blocking):** `/prompts` SSR load returns `[]` on a backend fetch failure (renders the empty-state, not an error banner); the composer popover path already surfaces `lib.error` on GET failure.

## Upstream lq-ai fix workflow (when a slice needs a backend change)

Don't edit `vendor/lq-ai` directly. Write a precise change/bug report to `docs/upstream-requests/<name>.md` (root cause + exact file/lines + fix + test), hand it to the user to relay to their separate LQ_AI claude-code session; when they report the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>`, `npm run gen:api`, rebuild affected containers, verify live, update `docs/decisions/lq-ai-pin.md`, commit on the phase branch. (Done twice in P2c.)
