# P7-2 — Data & privacy (Settings slice 2 of 4)

**Date:** 2026-05-31 · **Branch:** `p7-2-data-privacy` · **Phase:** P7 Settings, slice 2 (Account → **Data & privacy** → Preferences → Trust)

## Goal

Add a `/settings/data` "danger zone" to the existing P7-1 settings shell: **export your data** (GDPR Art. 20 — a background-built downloadable archive) and **delete your account** (GDPR Art. 17 — soft-scheduled deletion with a grace period). Reuse the P7-1 shell; this slice appends one rail entry and one sub-route.

## Backend contract (verified against `src/lib/api/backend.d.ts` @ pin `438198c`)

- **Export request:** `POST /api/v1/users/me/export` → `202 { job_id: string, status: "queued"|"processing"|"completed"|"failed", download_url?: string|null }`. Inserts a `user_export_jobs` row; the bundle is built by the **`ingest-worker`** (must be running locally).
- **Export poll:** `GET /api/v1/users/me/export/{job_id}` → `200 { job_id, status, download_url? }`. When `status==="completed"`, `download_url` is a **presigned MinIO URL valid 24h**. `404` covers both "no such job" and "belongs to another user" (no cross-user leak).
- **Deletion request:** `POST /api/v1/users/me/delete` → `202 { scheduled_deletion_at: string, grace_period_days: number }`. Soft-schedules deletion (`users.deletion_scheduled_at = now() + grace`), **revokes all sessions**. The user is effectively signed out after the POST but can sign back in during the grace window.
- **Deletion cancel:** `POST /api/v1/users/me/delete/cancel` → `204` if a pending deletion was cleared, `400` if there was nothing pending. Only valid during the grace window.

## Key design constraint

`deletion_scheduled_at` exists **only on `AdminUserRow`** (the admin user-list schema), **not** on the `User` schema returned by `GET /api/v1/users/me`. (Verified: `User` has no such field.) So a normal user's session **cannot detect a pending deletion** on a fresh load — we cannot conditionally render a "Pending deletion — Cancel" banner.

**Decision (c — both):** ship an **always-available "Cancel scheduled deletion"** control now, **and** file an upstream request to expose `deletion_scheduled_at` on the `User` schema so a future conditional banner can replace the always-on link.

## Decisions locked in brainstorming

1. **Page shape** — single `/settings/data` page; two stacked sections (Export card, then a red-bordered "Danger zone" delete section). Approved via mockup.
2. **Deletion confirm gravity** — **type-to-confirm**: a modal requiring the user to type `DELETE`; the confirm button stays disabled until it matches. (Chosen over a lighter acknowledgment-checkbox modal.)
3. **Export progress** — four states in one card: Idle → Queued/Processing (polling, button disabled) → Completed (Download archive + "Start a new export") → Failed (Try again). Client polling **pauses while the tab is hidden** and resumes on return.
4. **Cancel affordance** — always-visible "Cancel scheduled deletion" link in the danger zone (decision c above).
5. **Post-delete behavior** — render a one-time confirmation with the `scheduled_deletion_at` date + grace days, then clear the BFF session and redirect to `/login` (mirroring the existing logout path), since sessions are revoked server-side.

## Architecture

### Route & shell

- **`SettingsRail.svelte`** — append `{ href: '/settings/data', label: 'Data & privacy' }` to the `sections` array (built-as-you-go; rail already prefix-matches active state).
- **`src/routes/(app)/settings/data/+page.svelte`** — the page UI (export card + danger zone).
- **`src/routes/(app)/settings/data/+page.server.ts`** — SSR load (starts idle; nothing recoverable from `/users/me`) + form actions: `requestExport`, `requestDeletion`, `cancelDeletion`. All via `lqFetch`.
- **`src/routes/(app)/settings/data/export/[job_id]/+server.ts`** — BFF GET proxy for the client poll → `lqFetch` to `GET /users/me/export/{job_id}`. (A proxy is needed because the poll is a client-side `fetch` on an interval; the POSTs use form actions.)

### Components

- **Export card** (in `+page.svelte`, or a small `DataExportCard.svelte` if it earns its own file) — owns the export state machine and the poll controller.
- **Export poll controller** — a rune-based `$state` controller mirroring `KbFileRow`'s P4-3b ingest poll: starts on a returned `job_id`, polls the proxy GET on an interval, transitions on `status`, **pauses on `document.visibilityState === "hidden"`** and resumes on `visible`, stops on terminal states (`completed`/`failed`).
- **`DeleteAccountModal.svelte`** — type-`DELETE`-to-confirm modal; a11y mirrors `ReceiptsDrawer` (focus trap, `role="dialog"`, Esc to close, restore focus). Emits confirm only when the typed value matches.

### Data flow

- **Export:** click → `requestExport` action → `{ job_id }` → controller polls proxy GET → `completed` renders the presigned `download_url` as a "Download archive" link (plain `<a download>` with the `svelte/no-navigation-without-resolve` disable comment if it's an in-app anchor; external presigned URL likely needs no resolve) → "Start a new export" resets to idle.
- **Delete:** click "Delete my account" → open `DeleteAccountModal` → type `DELETE` → confirm → `requestDeletion` action → `{ scheduled_deletion_at, grace_period_days }` → render one-time confirmation → clear BFF session + `goto('/login?...')`.
- **Cancel:** click "Cancel scheduled deletion" → `cancelDeletion` action → `204` "Scheduled deletion cancelled" / `400` "No deletion was pending". Inline status message; no redirect.

## Upstream request (decision c)

Append a new ask to **`docs/upstream-requests/lq-ai-backend-asks-for-donna.md`** (the existing relay index for the LQ_AI session): expose `deletion_scheduled_at` (or a small status field/endpoint) on the `User` schema returned by `GET /api/v1/users/me`, so Donna can show a proper conditional "Pending deletion — cancel by `<date>`" banner and retire the always-on cancel link. When it lands: bump `vendor/lq-ai` pin → `npm run gen:api` → swap the link for the banner → log in `docs/decisions/lq-ai-pin.md`.

## Testing

- **Component/unit (vitest + jsdom):** export card state transitions (idle→processing→completed→failed); `DeleteAccountModal` gating (confirm disabled until typed value equals `DELETE`, Esc/focus-trap a11y); cancel link renders.
- **Server (`// @vitest-environment node`, `vi.mock('$lib/server/lqClient')`):** the three form actions (`requestExport`, `requestDeletion`, `cancelDeletion`) — success shapes + `cancelDeletion` `400` handling; the `[job_id]` proxy GET (success + `404`).
- **Live e2e (Playwright, mirrors `kb-management.spec.ts`, self-cleaning):**
  - **Export end-to-end** against the real `ingest-worker`: trigger → poll → assert a working download link appears.
  - **Deletion-confirm modal UI**: open, see the warning, confirm stays disabled until `DELETE` is typed, then **Cancel out — do NOT submit the real delete** (it would schedule-delete the admin fixture + revoke its sessions).
  - **Cancel-with-nothing-pending**: click "Cancel scheduled deletion" with no pending deletion → assert the `400`→"nothing pending" message. Safe to run live against the admin fixture.

## Scope / guardrails

- Reuse the P7-1 shell (`/settings/+layout.svelte`, `SettingsRail.svelte`) — only append the rail entry + add the `/settings/data` route.
- **e2e safety: never POST the real deletion in tests.**
- BFF: SSR load + form actions via `lqFetch`; one small `[job_id]` GET proxy for the client poll.
- Quality bar: `npm run check` 0 errors / 0 warnings; eslint clean (no `any`/`!`); modal a11y mirrors `ReceiptsDrawer`; in-app `<a>`/`goto` carry the `svelte/no-navigation-without-resolve` disable comment.

## Out of scope

- The conditional "Pending deletion" banner (blocked on the upstream ask above).
- P7-3 Preferences (the `User` preference fields: `reasoning_visibility`, `featured_tools`, `workspace_layout`, `trust_pills`, `provenance_pills`) and P7-4 Trust — later slices.
