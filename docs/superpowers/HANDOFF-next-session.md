# Donna — Handoff for the next session

**Date:** 2026-06-03 · **Pin:** `vendor/lq-ai` @ `c22360a` · **`main` HEAD:** `a86c178` (model/inference settings, PR #51).

## Where we are
This session opened **3 PRs** (all green, awaiting your review/merge), completing the three unblocked slices from the prior handoff:

- **Enhance-on-landing → PR #52** (`feat/enhance-on-landing`): the `✦ Enhance` affordance now works on the landing/Assistant composer. `createEnhance(chatId: string | null)` sends `chat_id: null` standalone (spike-confirmed); wired into `(app)/+page.svelte`. The obsolete "landing has no enhance" e2e was flipped to a positive flow. 910 unit + 2 live e2e.
- **About page slice 2a → PR #53** (`feat/about-page`): sidebar **About** entry (above Settings) → `/about` rail + page-per-topic guide mirroring `/settings`, with **8 instructional content pages** (Overview, Assistant, Projects, Workflows, Tabular, Knowledge, Models, Trust & citations) fact-checked against the real components, plus a **"Powered by LQ-AI" callout** → a minimal `/about/lq-ai` **stub**. 909 unit + 3 live e2e (`tests/about.spec.ts`).
- **Model-settings polish slice 3 → PR #54** (`feat/model-settings-polish`): stale-backing **disabled placeholder `<option>`** in `CategoryRow`, `OLLAMA_BASE_URL` documented in `.env.example`, and two `fail(400)` `?/reassign` tests. 913 unit.

See [[donna-phase-status]] for full roadmap history. Each slice ran the normal loop (brainstorm→spec→plan→subagent-driven-execute→whole-branch Opus review→PR); specs/plans under `docs/superpowers/{specs,plans}/2026-06-03-*`.

## Your job: the ONE remaining pre-wrap slice — About slice 2b
**About slice 2b — the "Powered by LQ-AI" full mirror** (replaces the `/about/lq-ai` stub from 2a). See [[donna-about-page]].

**Decisions LOCKED in the 2a brainstorm (don't re-litigate):**
- Mirror LQ-AI's **"How It Works" (16 sections)** + **"How to Build"** (contributor guide). Together they cover **all 18 playgrounds**.
- Playgrounds at `vendor/lq-ai/web/static/learn/playgrounds/*.html` are **zero-dependency vanilla HTML, copyable verbatim** → `Donna/static/learn/playgrounds/` and iframed (same as LQ-AI). LQ-AI Learn source pages: `vendor/lq-ai/web/src/routes/lq-ai/learn/{how,build}/+page.svelte` (how = 957 lines / 16 iframes; build = 599 lines). Both apps are SvelteKit/Svelte 5.
- Port = copy the 18 playgrounds + recreate the wrapper Svelte pages, swapping LQ-AI `--lq-*` CSS tokens → Donna `mlq-*`, with the user's intro paragraph on top ("Donna is powered by LQ-AI, an open source legal operating system. Donna uses some, but not all, of the functionality available in LQ-AI…").
- **Framing:** Donna showcases ONE subset of LQ-AI; this page exists to **inspire** what else you could build/power on the LQ-AI backend.

**Sequencing:** gated on #53 (builds on the `/about` IA + replaces its stub) — **branch 2b off `feat/about-page`**, or off `main` after #53 merges. Run its own brainstorm→spec→plan→execute→PR. It's design-heavy (18 large static files + 2 wrapper pages + token adaptation) — consider sub-slicing (e.g. How-It-Works first, then How-to-Build) if it's too big for one PR.

After 2b, the planned pre-wrap surface work is complete.

## Pending upstream (pin-gated, NOT blocking 2b)
When the user sends a SHA, pin `vendor/lq-ai` to it + `npm run gen:api`, then wire:
- **Ensemble verification** (`docs/upstream-requests/lq-ai-tabular-ensemble-verification.md`) → **P6-C.1**: per-column `ensemble_verification` toggle (plan Task 7 in `docs/superpowers/plans/2026-06-03-tabular-slice-c.md`). Also surfaces `verification_method` on tabular cell citations → **closes P6-B.1** (doc-panel "Unverified" chip).
- **Provider keys / BYOK** (`docs/upstream-requests/lq-ai-provider-key-management.md`) → the **provider-keys card** on `/settings/models`.

## Dev-stack reminders (see [[donna-dev-stack]])
- Shifted ports (coexists with the user's own lq-ai). Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App: http://localhost:13002 · API: :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`.
- **Rebuild `donna-web` before any live e2e** (serves built code). `.txt` won't ingest — use a `.pdf` fixture.
- Gate: **`npm run check` = 0 errors/0 warnings** is THE bar (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npm run lint`/`npx eslint .` has **~53 PRE-EXISTING errors on `main`** (unadopted svelte rules) — don't treat those as regressions; add no NEW ones (use the `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` comment on internal `<a href>`, as the sidebar/rail code does). `npx vitest run` ≈ **909 green** on `main`.
- **Ollama-in-Docker (in `.env`, now also documented in `.env.example` via #54):** `OLLAMA_BASE_URL=http://host.docker.internal:11434`.

## The build loop (working well all session)
brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → **subagent-driven execute** (fresh Sonnet per task, full task text pasted in, per-task spec + code-quality review, fix→amend) → **whole-branch Opus review** → `finishing-a-development-branch` → PR. For content-heavy work (the 8 About pages), parallel write-only content agents + ONE consolidated Opus content-accuracy fact-check pass worked well (it caught a real Knowledge defect). Upstream-request pattern: write `docs/upstream-requests/<name>.md`, hand to the user's parallel LQ-AI CC, pin the returned SHA.

See memories: [[donna-phase-status]] [[donna-about-page]] [[donna-enhance-on-landing]] [[donna-model-inference-settings]] [[donna-workflow]] [[donna-dev-stack]] [[donna-product-direction]] [[donna-citation-contract]] [[donna-reviewer-remote-hygiene]].
