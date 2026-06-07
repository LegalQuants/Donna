# LQ_AI backend — asks for Donna (relay index)

**From:** Donna frontend session · **To:** the LQ_AI backend session · **Date:** 2026-05-31 (status updated 2026-06-01) · **Pin Donna is on:** `945ad31`

> **How to use this file.** You (the LQ_AI session) work in the repo at **`/Users/kevinkeller/Code/lq-ai`**.
> These request docs live in the **Donna** repo at **`/Users/kevinkeller/Code/Donna/docs/upstream-requests/`** —
> read them directly by absolute path. Each detailed doc lists the exact lq-ai files to change (also by absolute path).
> When you merge any of these, tell Kevin the merged SHA; Donna then bumps its `vendor/lq-ai` submodule pin,
> runs `npm run gen:api`, rebuilds, verifies live, and logs the bump in
> `/Users/kevinkeller/Code/Donna/docs/decisions/lq-ai-pin.md`.

**Status (2026-06-01): P1.1–P1.4 all landed** and Donna is pinned at `945ad31` —
see _Already landed_ below. **No open asks remain.** The P1.1–P1.4 sections are kept below for
reference. (The bigger "autonomous workflows" item is **not** here — Donna tracks it in its own future
roadmap: `/Users/kevinkeller/Code/Donna/docs/roadmap/donna-future-roadmap.md`. You're building that
backend; the consumer-side requirements Donna will need are captured there for later.)

---

## P1.1 — Make `skill_inputs` actually reach the model for non-templated skills

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-skill-inputs-corpus.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/gateway/app/skills/assembler.py` (`interpolate` / `_render_skill` / `assemble_skill_prompt`)
  - test: `/Users/kevinkeller/Code/lq-ai/gateway/tests/test_inference_skill_assembly.py`
- **Gist:** `MessageCreate.skill_inputs` is accepted + forwarded as `lq_ai_skill_inputs`, but the assembler only
  substitutes `{{placeholder}}` tokens and silently drops unreferenced inputs. No built-in `SKILL.md` is templated,
  so collected inputs vanish for every built-in. **Recommended fix (Option A):** after interpolation, append any
  _unreferenced_ bound inputs as a short labelled context block, so every skill benefits with no corpus edits.
- **Unblocks (Donna):** the deferred composer skill-input form.

## P1.2 — Add `MessageCreate.file_ids` (per-message chat file attachment)

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-chat-message-file-attach.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/api/app/schemas/chats.py` (add optional `file_ids: string[]` to `MessageCreate`)
  - the chat-message send handler + gateway forwarding (the path that already forwards `lq_ai_skills`)
- **Gist:** files can already be uploaded via `POST /api/v1/files`, but `MessageCreate` has no file field and there's
  no `POST /chats/{id}/files`, so a client holding `file_id`s can't say "this turn is about these files." Add optional
  `file_ids?: string[]`, validate caller-owned ids (404/422, id-probing-safe), forward to the gateway as document
  context, and echo the applied ids on the message + SSE complete frame (like `applied_skills`). Please also document
  how this interacts with `skill_inputs` of `type:"file"`.
- **Unblocks (Donna):** composer file picker / drop-zone for ad-hoc per-turn document attachments.

## P1.3 — Add `PATCH /api/v1/users/me` (edit display_name / email)

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-patch-users-me-profile.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (add `PATCH /users/me`)
  - `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (a `UserProfileUpdate` model)
- **Gist:** `GET /users/me` exposes `display_name`/`email` and `PATCH /users/me/preferences` exists, but there's no
  `PATCH /users/me` to edit the profile fields — `/users/me` has `patch?: never`. `display_name`-only is enough to
  unblock; email self-service is your call. This is the _only_ thing blocking the editable-profile part of Donna's
  upcoming **Settings** page — everything else that page needs already exists.
- **Unblocks (Donna):** the profile-edit form in P7 Settings (the rest of P7 ships without it).

## P1.4 — Expose `deletion_scheduled_at` on `GET /users/me`

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (`GET /users/me`)
  - `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (the `User` response model)
- **Gist:** `deletion_scheduled_at` lives only on `AdminUserRow`, not on the `User` schema from
  `GET /users/me`, so a normal session can't detect a pending deletion on load. Donna ships an
  always-visible "Cancel scheduled deletion" link as a workaround. Add `deletion_scheduled_at`
  (or a small status field/endpoint) to `/users/me` so Donna can show a proper conditional
  "Pending deletion — cancel by <date>" banner instead.
- **Unblocks (Donna):** the conditional pending-deletion banner in P7-2 (the always-on cancel link ships without it).

---

## After any of these merge

1. You: report the merged SHA to Kevin.
2. Donna: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers →
   verify live → log the bump in `/Users/kevinkeller/Code/Donna/docs/decisions/lq-ai-pin.md` → build the unblocked slice.

## Already landed (no action — for your reference)

- **P1.1** skill_inputs → non-templated skills (DE-328) — lq-ai **#115** `396e19f`
- **P1.2** `MessageCreate.file_ids` channel (Part A) — lq-ai **#116** `1592063`
- **P1.2** file content → model, verbatim (Part B) — lq-ai **#117** `6dae35d`
- **P1.3** `PATCH /users/me` display_name (`UserProfileUpdate`; email edit deferred → DE-329) — lq-ai **#118** `e9659da`
- DE-329 filed + DE-328 marked resolved — lq-ai **#119** `badf83d`
- **P1.4** `deletion_scheduled_at` on `GET /users/me` — lq-ai `945ad31` (Donna pin PR #42); resolves `lq-ai-expose-deletion-status-on-users-me.md`. Consumed by the conditional pending-deletion banner on `/settings/data`.

All merged to lq-ai main; **Donna pinned at `945ad31`** as of 2026-06-01 (see `docs/decisions/lq-ai-pin.md`).

Earlier: anonymization-in-receipts (#102), streaming inference-routing-log (#103), `/v1/models` alias-field docs (#105) —
all merged and previously pinned at `438198c`.
