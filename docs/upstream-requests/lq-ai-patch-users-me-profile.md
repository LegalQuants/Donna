# Upstream request — `PATCH /api/v1/users/me` to edit profile (display_name / email)

**To:** lq-ai backend session · **From:** Donna · **Date:** 2026-05-31 · **Pin observed:** `438198c`
**Status:** BLOCKED for the editable-profile part of Donna's Settings page (P7).

> **File locations (absolute):**
> - This request doc lives in the **Donna** repo: `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-patch-users-me-profile.md`
> - The work happens in the **lq-ai** repo rooted at `/Users/kevinkeller/Code/lq-ai`. Files to change:
>   - Users router: `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (add a `PATCH /users/me`)
>   - User schema(s): `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (a `UserProfileUpdate` model)
>   - Regenerated contract Donna re-pulls after merge: `/Users/kevinkeller/Code/lq-ai/docs/api/backend-openapi.yaml`

## Summary

`GET /api/v1/users/me` returns a `User` with `display_name?: string | null` and `email`, and
`PATCH /api/v1/users/me/preferences` exists for preferences — but there is **no** `PATCH
/api/v1/users/me` to update the profile fields themselves. At `438198c`, `/api/v1/users/me` has
`patch?: never` in the generated contract. So Donna's Settings page can *show* the profile but can't
let the user **edit display name (or email)** — that part would be a permanent read-only stub.

This is the only thing blocking the editable-profile slice of Donna's **P7 Settings/Account/Trust**.
Everything else P7 needs already exists and is buildable now: `GET /users/me`, `PATCH
/users/me/preferences`, `POST /auth/change-password`, `POST /users/me/export` (+ poll), `POST
/users/me/delete` (+ `/cancel`), and the Trust/tier endpoints `GET /inference/tier-config` + `GET
/inference/current-tier`.

## Proposed change (smallest viable)

Add `PATCH /api/v1/users/me` accepting a small `UserProfileUpdate`:

```jsonc
// UserProfileUpdate (all optional; at least one required)
{
  "display_name": "Jane Counsel"
  // "email": "jane@firm.com"   // include only if email changes are in scope for self-service
}
```

Backend behavior we'd need:
- Update the caller's own `users` row (caller-scoped; never another user).
- `display_name`: trim + length-guard; allow clearing to null if desired.
- **`email`**: your call whether self-service email change is allowed at all. If yes, decide
  uniqueness handling (409 on collision) and whether it requires re-verification / MFA. If email is
  out of scope, ship `display_name`-only — that alone unblocks the Donna profile editor.
- Return the updated `User` (same shape as `GET /users/me`).

## Acceptance / test

- `PATCH /users/me { display_name: "X" }` → 200, returns updated `User`; `GET /users/me` reflects it.
- Empty/whitespace-only `display_name` → 422 (or documented clear-to-null behavior).
- (If email in scope) duplicate email → 409, id-probing-safe.
- Regenerated OpenAPI shows `PATCH /api/v1/users/me` + `UserProfileUpdate` so Donna's `npm run
  gen:api` picks it up.

## Donna-side follow-up once this lands

Bump the submodule pin → `npm run gen:api` → wire the profile-edit form on the Settings page (the
rest of the Settings/Trust surface ships independently of this, since it's all already supported).
Update `/Users/kevinkeller/Code/Donna/docs/decisions/lq-ai-pin.md` bump log.

## Note — not blockers, deliberately out of scope for P7

- **Plan/subscription/tier display:** no billing concept exists in lq-ai (self-hosted) — N/A unless a
  SaaS model is added later.
- **Anonymization config visibility:** no user-facing privacy-posture endpoint today. Donna's Trust
  page will use `GET /inference/tier-config` + `GET /inference/current-tier` for now; a dedicated
  privacy-posture endpoint could be a future ask if we want to surface anonymization state.
