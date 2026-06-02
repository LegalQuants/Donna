# Donna — Handoff for the next session

**Date:** 2026-06-01 · **Pin:** `vendor/lq-ai` @ `badf83d` (v0.4.0) — **bump to `945ad31` first thing (see §1).**

## Open PRs (merge in order; all green, all reviewed)

- **#40 — P7-3 Preferences + ambient trust pills** — likely already merged by the time you read this; if not, merge it.
- **#41 — P7-4 Trust page** — **completes P7 Settings.** Read-only `/settings/trust` (model trust matrix + tier policy + anonymization callout). Merge it.

After both merge: `git checkout main && git pull`. **P7 is then fully done** (Account · Data & privacy · Preferences · Trust).

## ⏩ Status for the NEW session (read this first)

- **P7 is complete** (Account · Data & privacy · Preferences · Trust — PRs #35/#37/#40/#41, all merged to `main`).
- **§1 below (the pin bump) is already DONE** — shipped as **PR #42** (`chore/lq-ai-pin-945ad31`): `vendor/lq-ai` bumped `badf83d`→`945ad31`, `npm run gen:api` ran (added nullable `deletion_scheduled_at` to the `User` schema), check 0/0, stack rebuilt. **Merge #42 if it isn't already**, then `git checkout main && git pull`.
- **Your job: §2 — build the conditional "Pending deletion" banner.** Start a fresh feature branch off `main` and run the normal loop (brainstorm-lite → spec → plan → subagent-execute → PR). The design is essentially settled below; the only real open question is the e2e-safety approach (see §2).

## §1 — DONE (PR #42): lq-ai pin bump `badf83d` → `945ad31` (P1.4 landed)

*(Kept for reference — this was completed in the prior session.)*

The LQ-AI session merged **P1.4** (DE-330-ish): `GET /users/me` (and login/refresh) now return a **nullable `deletion_scheduled_at`** on the user object — non-null while a deletion is pending, null otherwise. Read-only echo of the existing column; no migration; `test_openapi` stays 114; caller-scoped (no cross-user leak); round-trip verified (delete sets it → /users/me shows it → cancel clears it).

**Merged SHA = `945ad3155edb1e06cecba9abf35d79ddd1b9ecac`** (current main tip on both lq-ai remotes).

Do the established pin-bump workflow (see `docs/decisions/lq-ai-pin.md` bump log for the exact steps; we did it twice this session):
1. `cd vendor/lq-ai && git fetch && git checkout 945ad31 && cd -`
2. `npm run gen:api` — expect a **small additive diff**: `deletion_scheduled_at?: string | null` added to the `User` schema (and wherever `UserPublic` is echoed). `npm run check` should stay 0/0.
3. Rebuild the stack so the running api serves it: `set -a; . ./.env; set +a; docker compose up -d --build api gateway donna-web ingest-worker arq-worker` (badf83d→945ad31 is tiny; migrations are a no-op, but rebuilding api is correct). All 8 containers healthy.
4. Update `docs/decisions/lq-ai-pin.md` bump log; commit on a branch; this can ride in the same PR as the §2 banner work (they're directly related) or its own `chore/lq-ai-pin-945ad31` PR.

## §2 — NEXT FEATURE: P7-2 follow-up — conditional "Pending deletion" banner

Now that `deletion_scheduled_at` is on `/users/me` (→ `locals.user` → `data.user`), **replace P7-2's always-visible "Cancel scheduled deletion" link with a conditional banner.** This is the clean version P7-2 deferred (decision "c"). Scope:
- On `/settings/data` (`src/routes/(app)/settings/data/+page.svelte`), when `data.user?.deletion_scheduled_at` is non-null, show a **"Pending deletion — scheduled for `<date>`; cancel to keep your account"** banner with the cancel control; when null, **hide the cancel control entirely** (today it's always shown). The delete button + modal stay as-is.
- The cancel action already exists (`?/cancelDeletion` → 204/400). After a successful cancel, `invalidateAll()` so `data.user.deletion_scheduled_at` refreshes to null and the banner disappears.
- Retire/repoint the upstream ask: mark **P1.4 landed** in `docs/upstream-requests/lq-ai-backend-asks-for-donna.md` (move to *Already landed*) and note `lq-ai-expose-deletion-status-on-users-me.md` is resolved.
- This is small — likely a brainstorm-lite → spec → ~3-task plan (banner UI + the conditional logic + an e2e that schedules-then-cancels a deletion **on a throwaway path, NOT the admin fixture** — careful: actually scheduling deletion revokes the admin's sessions; consider testing the banner render via the new field without a real POST, or use a dedicated test user if one can be created). **Settle the e2e safety approach in the spec.**

## §3 — Then: remaining roadmap

Order (user-confirmed): finish the now-unblocked items + P6.
- **Now unblocked by the v0.4.0 + P1.4 bumps (build when ready):**
  - **Profile editing** (P1.3, `PATCH /users/me` + `UserProfileUpdate`) — flip the P7-1 Account page's read-only `display_name` into an editable field. Small. (Note the brand rebrand: `rebrandName` in `src/lib/brand.ts` rewrites "LQ.AI"→"Donna" for *display*; once the user can set a real display_name, that transform becomes a harmless no-op.)
  - **Composer skill-input form** (P1.1) — collect skill inputs in the composer; they now reach the model (DE-328). The reference widget-by-type is the vendor `SkillInputForm.svelte`.
  - **Chat file-attach** (P1.2) — `MessageCreate.file_ids` channel + `applied_file_ids` echo; composer file picker / per-turn attach.
- **P6 Tabular** — the largest FE build; full backend support at `/api/v1/tabular/*` (see `donna-phase-status` memory for the contract). User wants P6 after P7.
- **Autonomous workflows** — v0.4.0 shipped `/api/v1/autonomous/*`; deferred to `docs/roadmap/donna-future-roadmap.md`; the `/workflows` area is built to extend to it as a 4th segment.

## Cold start (every session)

1. `git checkout main && git pull`.
2. Bring the stack up (shifted ports; coexists with the user's own lq-ai):
   ```bash
   set -a; . ./.env; set +a
   docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
   ```
   App at http://localhost:13002. Login `admin@lq.ai` / `$DONNA_E2E_PASSWORD`. Details in `donna-dev-stack` memory + `README.md`.
3. Verify gate: `npm run check` (expect "0 errors and 0 warnings"; vendor `ERR_MODULE_NOT_FOUND` stderr is harmless) · `npx vitest run` (expect ~760 green) · live e2es via `set -a; . ./.env; set +a; npx playwright test`.
4. **e2e gotchas banked this session:**
   - The running `donna-web` serves *built* code — `docker compose up -d --build donna-web` after `src/` changes before live e2e.
   - **Live RAG e2es need `/tmp/spike.pdf` + `/tmp/spike2.pdf`** (ephemeral; cleaned from /tmp). Regenerate with `cupsfilter spike.txt > spike.pdf` (reportlab/fpdf NOT installed). A missing fixture surfaces as an `ENOENT`/ingestion-timeout masquerading as broken ingestion — it isn't.
   - **Preference/settings e2es mutate the shared admin fixture** — reset to defaults at start AND in `finally` (an interrupted run leaves dirty state that fails the *next* run's start assertions).

## The build loop (working well)

brainstorm (`superpowers:brainstorming`, one question at a time / visual companion for UI) → spec (`docs/superpowers/specs/`) → plan (`superpowers:writing-plans`, TDD, full code per task) → execute (`superpowers:subagent-driven-development`: fresh sonnet implementer per task + verify inline for trivial tasks / dispatch reviewers for substantive ones + **whole-branch opus review**) → `superpowers:finishing-a-development-branch` → **PR into `main`** → update memory. Quality bar: `npm run check` 0/0, eslint clean (no `any`/`!`), live e2e self-cleaning. **Lesson banked (P7-3/P7-4): components reading prefs/user do `import { page } from '$app/state'` → `page.data.user?.x` and tests must `vi.mock('$app/state', …)`; testing a `+page.server.ts` `load()` directly needs a cast (its `PageServerLoad` return includes `void`).**

See memories: [[donna-phase-status]], [[donna-lq-ai-v040-bump-parked]], [[donna-dev-stack]], [[donna-workflow]], [[donna-citation-contract]].
