# LQ_AI ask — expose `deletion_scheduled_at` on `GET /users/me`

**From:** Donna frontend session · **Date:** 2026-05-31 · **Pin Donna is on:** `438198c`

## Problem

P7-2 (Donna's Data & privacy settings) ships account deletion against the existing
`POST /api/v1/users/me/delete` (soft-schedules + revokes sessions) and
`POST /api/v1/users/me/delete/cancel`. But `deletion_scheduled_at` is exposed **only on
`AdminUserRow`** (the admin user-list schema) — the `User` schema returned by
`GET /api/v1/users/me` has no such field. So a normal user's session cannot detect a
pending deletion on load, and Donna cannot conditionally render a proper
"Pending deletion — cancel by <date>" banner.

## Current workaround (shipped in P7-2)

An **always-visible** "Cancel scheduled deletion" control that POSTs the cancel endpoint
(`204` → "cancelled", `400` → "nothing pending"). Functional, but it's always shown even
when nothing is pending — slightly awkward.

## Requested change

Expose the pending-deletion state on the user-facing profile, either:
- add `deletion_scheduled_at?: string | null` to the `User` schema returned by
  `GET /api/v1/users/me`, **or**
- add a small dedicated status field/endpoint Donna can read on load.

## lq-ai files (approx.)

- `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (`GET /users/me` handler)
- `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (the `User` response model)

## Unblocks (Donna)

Replace the always-on cancel link with a conditional "Pending deletion — cancel by <date>"
banner. Donna will bump the pin, run `npm run gen:api`, swap the link for the banner, and
log it in `docs/decisions/lq-ai-pin.md`.
