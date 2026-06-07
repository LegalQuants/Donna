# Upstream request (lq-ai): per-message file attachment on chat turns

**Requested by:** Donna frontend · **Date:** 2026-05-28 · **Pin context:** verified against `vendor/lq-ai` @ `438198c`
**Status:** BLOCKED — needs a backend change before Donna can implement chat-level file upload.

> **File locations (absolute):**
>
> - This request doc lives in the **Donna** repo: `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-chat-message-file-attach.md`
> - The work happens in the **lq-ai** repo rooted at `/Users/kevinkeller/Code/lq-ai`. Files to change:
>   - `MessageCreate` schema: `/Users/kevinkeller/Code/lq-ai/api/app/schemas/chats.py` (add optional `file_ids`)
>   - The chat-message send handler + gateway forwarding (same area that already forwards `lq_ai_skills`)
>   - Regenerated contract Donna re-pulls after merge: `/Users/kevinkeller/Code/lq-ai/docs/api/backend-openapi.yaml`

## What Donna wants to build

Let a user attach one or more **ad-hoc files to a single chat message** (drag-drop / file picker in the composer), so the model — and any attached skills — can see those documents for that turn. This is distinct from **knowledge-base** attachment (persistent, embedded/retrieved corpus): chat-level attach is ephemeral, per-message, "look at _this_ doc right now."

Files can already be uploaded today via `POST /api/v1/files` (Donna does this for matter/KB files), so the client can obtain `file_id`s. The gap is purely in **associating uploaded files with a chat message at send time** and forwarding them to the gateway/model.

## The gap (exact, verified against the generated contract)

1. **`MessageCreate` has no file field.** At `438198c`, `components['schemas']['MessageCreate']` is:
   - `content: string`, `model: string`, `stream: boolean`, `skills?: string[]`, `skill_inputs?: {...}` — and nothing else.
   - There is **no** `file_ids` / `attached_files` / `documents` field.
2. **No per-chat file endpoint.** There is no `POST /api/v1/chats/{chat_id}/files` (nor a documented `chats/{id}/attachments`). Chats only relate to files indirectly via a project's knowledge bases.

So a client holding valid `file_id`s has no contract-supported way to say "this message is about these files."

## Proposed change (smallest viable)

Add an optional `file_ids?: string[]` (UUIDs of already-uploaded `files` rows owned by the caller) to **`MessageCreate`**:

```jsonc
// MessageCreate
{
	"content": "Summarize the indemnity in this draft.",
	"model": "smart",
	"skills": ["contract-qa"],
	"skill_inputs": { "...": {} },
	"file_ids": ["<uuid>", "<uuid>"] // NEW — ad-hoc per-turn attachments
}
```

Backend behavior we'd need:

- **Validate ownership/existence** of each `file_id` (caller-scoped; 404/422 on bad/foreign id, id-probing-safe — mirror the user-skills pattern).
- **Forward to the gateway** alongside `lq_ai_skills` (e.g. as `lq_ai_file_ids` / document context), so the model and skills receive the file content/text for that turn. (Whether the gateway ingests raw bytes vs. extracted text is the backend's call — Donna just needs the association + forwarding.)
- **Echo on the message / SSE complete frame** which files were applied (e.g. `messages.attached_file_ids` or an `attached_files` summary), the same way `applied_skills` is echoed — so the UI can confirm what the turn actually saw.
- Decide & document the **interaction with skill_inputs of `type: file`** (`SkillInputDef.type` can be `"file"`): can a `file_id` be bound to a skill's file input via `skill_inputs`, or is `file_ids` a separate channel? Donna needs to know which to populate.

## Acceptance / test the backend change should include

- `POST /api/v1/chats/{id}/messages` (stream + non-stream) with `file_ids: [valid]` → 2xx; the assistant turn demonstrably has access to the file content; response echoes the applied file ids.
- `file_ids: [<foreign or nonexistent uuid>]` → 404/422 (id-probing-safe), no leakage.
- `file_ids: []` / omitted → unchanged behavior (back-compat).
- Regenerated OpenAPI shows `MessageCreate.file_ids?: string[]` (so Donna's `npm run gen:api` picks it up).

## Donna-side follow-up once this lands

Bump the submodule pin → `npm run gen:api` → composer gets a file picker + drop zone that uploads via `POST /api/v1/files`, threads the returned `file_id`s into `MessageCreate.file_ids` (parallel to how `skills[]` is threaded today in `src/lib/chat/chatStream.svelte.ts`), and surfaces the echoed attached files (parallel to the unused-today `applied_skills`). Update `docs/decisions/lq-ai-pin.md` bump log.

## Related, separate gap (noted, not part of this request)

`MessageCreate.skill_inputs` and `GET /api/v1/skills/{slug}/inputs` already exist, but Donna does **not yet collect or send `skill_inputs`** — skills with declared required inputs can't be parameterized from the UI yet. That's a Donna-frontend build (skill-inputs application UI / playbooks), **not** an upstream blocker — flagged here only so the two "apply skills/files properly" threads aren't conflated.
