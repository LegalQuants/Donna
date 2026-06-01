# Donna — Handoff for the next session

**Date:** 2026-05-31 · **Branch state:** everything below is **merged to `main`** (this handoff PR merges too). Start from a clean `main`.

## What shipped this session (all merged)

- **#31 — P5 Unified Workflows IA.** `/workflows` hub + shared `WorkflowsNav` segmented sub-nav mounted on the hub + Skills/Playbooks/Prompts index pages; sidebar consolidated 4→1 "Workflows" entry (prefix-`match` active-state). **P5 Workflows now structurally complete.**
- **#32 — Test debt cleared.** `tests/citation-pills.spec.ts` + `tests/citation-live.spec.ts` updated to the P3-2 model (popover is hover/**focus**-triggered + still `role="dialog"`; click opens the doc panel). Drive via `.focus()`.
- **#33 — LQ_AI backend asks (full paths) + autonomous-workflows roadmap.** Relay index for the LQ_AI session: **`/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-backend-asks-for-donna.md`** (3 asks: skill_inputs reach model, `MessageCreate.file_ids`, **`PATCH /users/me`**). Autonomous workflows deferred to `docs/roadmap/donna-future-roadmap.md`. The LQ_AI session works in `/Users/kevinkeller/Code/lq-ai`.
- **#34 — P8 Redline pane.** Read-only consolidated **Redlines** document view toggled on the playbook run-results page (custom renderer, NOT TipTap). New `RedlineChange`/`RedlineDocument`/`compareBySeverity`; toggle in `ExecutionResults`.
- **#35 — P7-1 Settings shell + Account & Security.** `/settings` area (left sub-rail + sub-routes; ⚙ sidebar entry); Account page (read-only profile, Change-password link, MFA status + disable). Also fixed a real bug (caught by opus review): `hooks.server.ts` bounced authed users off `/change-password` — exempted it.

Full per-slice detail is in the `donna-phase-status` project memory.

## What's next: **P7-2 — Data & privacy** (Settings slice 2 of 4)

P7 was decomposed (agreed) into **4 thin slices, order: Account → Data & privacy → Preferences → Trust.** P7-1 (Account) merged. **P7-2 = Data & privacy** is next — the "danger zone": **data export** + **account deletion**.

**This is a fresh feature → start with the brainstorming skill.** The brainstorm was *paused at the visual-companion offer* to hand off — so begin there (offer the companion; the danger-zone layout + export-progress + deletion-confirm flows are visual).

### Backend contract (confirmed against `src/lib/api/backend.d.ts` @ pin `438198c`)
- **Export:** `POST /api/v1/users/me/export` → 202 `{ job_id, status: 'queued'|'processing'|'completed'|'failed', download_url?: string|null }`; poll `GET /api/v1/users/me/export/{job_id}` (same shape; 404 if not yours). `download_url` is a **presigned URL valid 24h** once `status==='completed'`. **Needs the `ingest-worker`** running locally (it builds the export ZIP).
- **Deletion:** `POST /api/v1/users/me/delete` → 202 `{ scheduled_deletion_at, grace_period_days }`. Soft-schedules + **revokes all sessions** (the user is effectively signed out after the POST; can still log in again during the grace window). `POST /api/v1/users/me/delete/cancel` → 204, or **400 if no pending deletion**.

### ⚠️ The key design constraint (drives the deletion UX)
`deletion_scheduled_at` exists **only on `AdminUserRow`** (the admin user-list schema) — **NOT** on the user-facing `UserPublic` returned by `GET /api/v1/users/me`. So a normal user's session **cannot detect a pending deletion** on a fresh load, which means the **Cancel affordance can't be conditionally shown**. Open fork to settle in brainstorming:
- (a) an **always-available "Cancel scheduled deletion"** control (POST cancel; 204→"cancelled", 400→"nothing pending") — functional now, slightly awkward;
- (b) **file an upstream request** to expose `deletion_scheduled_at` (or a status endpoint) on `/users/me`, so a proper "Pending deletion — Cancel" banner can be shown — better, but blocks the clean version;
- (c) **both** — ship (a) now + file the request for (b) later. (Likely recommendation.)

### Other open brainstorming decisions
- **Deletion confirm gravity:** type-to-confirm (type email or "DELETE") vs a strong confirm modal. (Grace period exists, so it's reversible-ish during grace.)
- **Post-delete behavior:** since sessions are revoked, show the `scheduled_deletion_at` + grace once, then sign the user out / redirect to `/login` with a message.
- **Export progress UX:** client-side polling (rune controller, like `KbFileRow`'s ingest poll in P4-3b) → queued/processing → a **Download** link when ready; visibility-pause optional.
- **Layout:** a `/settings/data` sub-route; **add a second entry to `SettingsRail`'s `sections` array** ("Data & privacy" → `/settings/data`) — the rail is built-as-you-go.

### Scope / guardrails
- Reuse the P7-1 shell — `/settings/+layout.svelte` + `SettingsRail.svelte` already exist; just append the rail entry + add the `/settings/data` page.
- **e2e safety:** do **NOT** actually POST the deletion in e2e (it would schedule-delete the admin fixture + revoke its sessions). Cover **export end-to-end** (real `ingest-worker` job) + the **deletion-confirm modal UI** (open, warning, confirm-gating, cancel) **without submitting** the real delete. Mirror the export-poll test approach to `kb-management.spec.ts`.
- BFF: SSR load + form actions via `lqFetch` (no new proxy routes unless the client-poll needs a `/settings/data/export/[job_id]` GET proxy — decide in design; a small BFF proxy for the poll is reasonable, mirroring other client-poll paths).

## Cold start (every session)

1. `git checkout main && git pull` (this handoff is merged).
2. Bring the stack up (shifted ports; coexists with the user's own lq-ai). **`ingest-worker` is required for P7-2 export**; `arq-worker` for playbooks easy-gen:
   ```bash
   set -a; . ./.env; set +a
   docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
   ```
   App at http://localhost:13002. Login fixture `admin@lq.ai` / `$DONNA_E2E_PASSWORD`. Details in `donna-dev-stack` memory + `README.md`.
3. Verify gate: `npm run check` (expect "0 errors and 0 warnings"; vendor `ERR_MODULE_NOT_FOUND` stderr is harmless) · `npx vitest run` (expect ~697 green) · live e2es via `set -a; . ./.env; set +a; npx playwright test`.
4. **e2e gotcha:** the running `donna-web` container serves *built* code — after changing `src/`, rebuild it (`docker compose up -d --build donna-web`) before live e2e, or it serves stale code.

## The build loop (established, working well)

brainstorm (`superpowers:brainstorming`, one question at a time / visual companion for UI) → spec (`docs/superpowers/specs/`) → plan (`superpowers:writing-plans`, TDD, full code per task) → execute (`superpowers:subagent-driven-development`: fresh implementer per task + **two-stage review — spec compliance, then code quality** — fix loops, commit per task) → final whole-branch review (opus) → `superpowers:finishing-a-development-branch` → **PR into `main`** → update memory. Quality bar: `npm run check` 0/0, eslint clean (no `any`/`!`), modal a11y mirrors `ReceiptsDrawer`, in-app `<a>`/`goto` carry the `svelte/no-navigation-without-resolve` disable comment, server tests `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`, live e2es self-clean. **Lesson banked (P7-1): verify `(auth)`-group reachability against the global `hooks.server.ts` handle, not just a route's local guard.**

## After P7: remaining work

- **P7-3 Preferences** then **P7-4 Trust** (the last two P7 slices), then **P6 Tabular** (full backend support at `/api/v1/tabular/*`; the largest frontend build). Order requested by the user: finish P7, then P6.
- **Upstream-blocked (waiting on the LQ_AI session, relay doc = `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`):** skill-inputs composer form; chat-level file attach; **P7 profile editing** (`PATCH /users/me`); possibly **P7-2 pending-deletion visibility** if we file fork (b) above. When any merges: bump `vendor/lq-ai` pin → `npm run gen:api` → build the unblocked slice → log in `docs/decisions/lq-ai-pin.md`.
- **Autonomous workflows:** deferred to `docs/roadmap/donna-future-roadmap.md` (waiting on LQ_AI Milestone 4; consumer-contract checklist captured there).
