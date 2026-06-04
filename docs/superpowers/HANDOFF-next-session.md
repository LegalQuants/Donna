# Donna — Handoff for the next session

**Date:** 2026-06-04 · **Pin:** `vendor/lq-ai` @ `541bd6f` (bumped from `c22360a` in PR #57) · **`main` HEAD:** model/inference settings + the 2026-06-03/04 session merges.

## Where we are — the planned pre-wrap surface work is essentially DONE
This session shipped **6 PRs** (the first five merged to `main`; #57 open at handoff time):

- **Enhance-on-landing → PR #52 (merged):** `✦ Enhance` on the landing/Assistant composer (`createEnhance(chatId: string | null)` → `chat_id: null` standalone).
- **About page → PRs #53 + #55 + #56 (all merged) — COMPLETE:**
  - **2a (#53):** sidebar **About** entry (above Settings) → `/about` rail + 8 instructional topic pages (Overview, Assistant, Projects, Workflows, Tabular, Knowledge, Models, Trust & citations), mirroring `/settings`; + a "Powered by LQ-AI" callout → an `/about/lq-ai` stub.
  - **2b-i (#55):** the stub → **"How It Works"** — 16 re-skinned playground sections + a Donna-authored **"Build & Learn with LQ-AI"** closing section; + the layout widening (`/about/lq-ai` → `max-w-6xl`, prose pages → `max-w-5xl`).
  - **2b-ii (#56):** **"How to Build"** at `/about/lq-ai/build` (curated contributor port + `skill-format` playground); all 18 playgrounds now copied; How-It-Works ↔ How-to-Build cross-links.
- **Model-settings polish → PR #54 (merged):** stale-backing disabled `<option>` in `CategoryRow`; `OLLAMA_BASE_URL` in `.env.example`; two `?/reassign` 400 tests.
- **P6-C.1 tabular ensemble verification → PR #57 (open at handoff):** pin bump `c22360a`→`541bd6f` (Donna #6 / lq-ai #127) + `gen:api`; per-column **Ensemble verification** toggle + **cost premium** + `verification_method` on cell citations; **closes P6-B.1** (doc panel shows green "✓ Verified" for ensemble citations, no chip for non-ensemble). Note: this also makes **ensemble-verified CHAT citations read green "Verified"** (shared `citeState` GREEN set — a correctness fix matching the tooltip); Trust About page copy updated to match.

See [[donna-phase-status]] for full history. Every slice ran the loop (brainstorm→spec→plan→subagent-execute→whole-branch Opus review→PR); specs/plans under `docs/superpowers/{specs,plans}/2026-06-0{3,4}-*`.

## Your job: the only remaining pre-wrap item is upstream-BLOCKED
**Provider keys / BYOK** on `/settings/models` — still pin-gated, **no backend SHA yet**. Upstream request: `docs/upstream-requests/lq-ai-provider-key-management.md`. The card is stubbed/pin-gated on `/settings/models` (Task 5 of `docs/superpowers/plans/2026-06-03-model-inference-settings.md`). When the user sends a SHA: bump `vendor/lq-ai` + `npm run gen:api` + rebuild, then wire the provider-keys card. **There is no unblocked Donna feature work pending** beyond this — the roadmap's planned surfaces (P0–P7, P6 Tabular A–C + C.1, model/inference settings, About) are all shipped.

If the user wants more, options live in [[donna-product-direction]] (capability backlog) and `docs/roadmap/donna-future-roadmap.md` (autonomous workflows surface, etc.).

## Pending upstream (pin-gated)
- **Provider keys / BYOK** → the provider-keys card (above). The ONLY open Donna ask.
- (P6-C.1 ensemble verification's *live output* — cost premium + ✓Verified on real runs — needs the deployment's gateway `citation_engine.ensemble_verification.judge_models` to be non-empty; the dev stack ships it empty/opt-in. FE rendering is unit-tested; not a Donna code gap.)

## Dev-stack reminders (see [[donna-dev-stack]])
- Shifted ports. Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App: http://localhost:13002 · API: :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`.
- **Rebuild `donna-web` before any live FE e2e**; rebuild **api+gateway+arq-worker+ingest-worker** when the pin changes. `.txt` won't ingest — use a `.pdf` fixture.
- Gate: **`npm run check` = 0 errors/0 warnings** is THE bar (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npm run lint`/`npx eslint .` has **~53 PRE-EXISTING errors on `main`** (unadopted svelte rules) — add no NEW ones (use the `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` comment on internal/dynamic `<a href>`; static external https links don't need it). `npx vitest run` ≈ **925 green**.

## The build loop (worked well all session)
brainstorm → spec → plan → **subagent-driven execute** (fresh Sonnet per task, full task text, per-task spec + code-quality review, fix→amend) → **whole-branch Opus review** → `finishing-a-development-branch` → PR. The whole-branch Opus review keeps earning its keep (this session it caught the `$app/forms` `enhance` shadowing, the Knowledge "sidebar" content defect, and the stale Trust-page copy after the ensemble GREEN change). For content-heavy work, parallel write-only content agents + one consolidated Opus fact-check pass. Upstream-pin pattern: bump submodule → `gen:api` → rebuild → verify → update `docs/decisions/lq-ai-pin.md` → commit on the phase branch.

See memories: [[donna-phase-status]] [[donna-about-page]] [[donna-model-inference-settings]] [[donna-enhance-on-landing]] [[donna-workflow]] [[donna-dev-stack]] [[donna-product-direction]] [[donna-citation-contract]] [[donna-reviewer-remote-hygiene]].
