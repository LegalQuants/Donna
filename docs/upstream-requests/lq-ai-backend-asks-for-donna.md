# LQ_AI backend — asks for Donna (relay index)

**From:** Donna frontend session · **To:** the LQ_AI backend session · **Date:** 2026-05-31 · **Pin Donna is on:** `438198c`

> **How to use this file.** You (the LQ_AI session) work in the repo at **`/Users/kevinkeller/Code/lq-ai`**.
> These request docs live in the **Donna** repo at **`/Users/kevinkeller/Code/Donna/docs/upstream-requests/`** —
> read them directly by absolute path. Each detailed doc lists the exact lq-ai files to change (also by absolute path).
> When you merge any of these, tell Kevin the merged SHA; Donna then bumps its `vendor/lq-ai` submodule pin,
> runs `npm run gen:api`, rebuilds, verifies live, and logs the bump in
> `/Users/kevinkeller/Code/Donna/docs/decisions/lq-ai-pin.md`.

These are the only backend changes Donna currently needs. All three are small and independent — good
candidates to fold into the **Milestone 4** wrap-up. (The bigger "autonomous workflows" item is **not**
here — Donna has moved it to its own future roadmap: `/Users/kevinkeller/Code/Donna/docs/roadmap/donna-future-roadmap.md`.
You're building that backend; the consumer-side requirements Donna will need are captured there for later.)

---

## P1.1 — Make `skill_inputs` actually reach the model for non-templated skills

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-skill-inputs-corpus.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/gateway/app/skills/assembler.py` (`interpolate` / `_render_skill` / `assemble_skill_prompt`)
  - test: `/Users/kevinkeller/Code/lq-ai/gateway/tests/test_inference_skill_assembly.py`
- **Gist:** `MessageCreate.skill_inputs` is accepted + forwarded as `lq_ai_skill_inputs`, but the assembler only
  substitutes `{{placeholder}}` tokens and silently drops unreferenced inputs. No built-in `SKILL.md` is templated,
  so collected inputs vanish for every built-in. **Recommended fix (Option A):** after interpolation, append any
  *unreferenced* bound inputs as a short labelled context block, so every skill benefits with no corpus edits.
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
  unblock; email self-service is your call. This is the *only* thing blocking the editable-profile part of Donna's
  upcoming **Settings** page — everything else that page needs already exists.
- **Unblocks (Donna):** the profile-edit form in P7 Settings (the rest of P7 ships without it).

---

## After any of these merge

1. You: report the merged SHA to Kevin.
2. Donna: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers →
   verify live → log the bump in `/Users/kevinkeller/Code/Donna/docs/decisions/lq-ai-pin.md` → build the unblocked slice.

## Already landed (no action — for your reference)

Anonymization-in-receipts (#102), streaming inference-routing-log (#103), `/v1/models` alias-field docs (#105) —
all merged and pinned at `438198c`.
