# Chat file-attach (P1.2)

**Date:** 2026-06-02 · **Branch:** `feat/chat-file-attach` · **Pin:** `vendor/lq-ai` @ `945ad31`

## Why

Users can attach ad-hoc documents to a single chat turn so the model (and any attached skills) see
them for that message. The backend contract is in place at `945ad31`: `MessageCreate.file_ids?:
string[]` (caller-owned file UUIDs, validated server-side, **capped at 16**, forwarded to the
gateway as `lq_ai_file_ids`, echoed as `applied_file_ids` on the send response / SSE `complete`
frame — **not** persisted to message rows). Files are uploaded via the existing `POST
/api/v1/files` (returns a `File` with async `ingestion_status` pending→processing→ready→failed).
This is distinct from KB attach (persistent, project-scoped) and from `skill_inputs` (no
`type:"file"` binding — explicitly separate channels per the contract).

## Decisions (settled in brainstorming)

- **Readiness gate:** Send is disabled until every attached file is `ready` (a still-uploading,
  processing, or `failed` file blocks; failed files must be removed).
- **Both composers:** carry `file_ids` through the landing flow via a new `donna_draft_file_ids`
  cookie, parallel to `donna_draft_skills` / `donna_draft_skill_inputs`.
- **Message indicator:** show a `📎 N file(s)` indicator on the completed turn next to the
  existing "Applied: <skills>" pills (count-based — the echo is UUIDs).
- **Attach UX:** a paperclip button in the composer toolbar opens the file picker; drag-drop onto
  the composer also attaches. Attached files render as chips above the textarea.

## File structure

**New:**
- `src/lib/files/types.ts` — `AttachedFile` interface + re-export of the generated `File` type.
- `src/lib/files/fileAttach.svelte.ts` (+ `.svelte.test.ts`) — the `createFileAttach` controller.
- `src/routes/(app)/chats/[id]/draftFileIds.ts` (+ `draftFileIds.test.ts`) — `parseDraftFileIds`.
- `tests/chat-file-attach.spec.ts` — live e2e.

**Modified:**
- `src/lib/chat/sse.ts` — add `applied_file_ids?: string[]` to the `delta` frame and to the
  `complete` frame's `message`.
- `src/lib/chat/chatStream.svelte.ts` (+ test) — `fileIds` 5th arg through `send`/`runStream`/
  `retry`; body `file_ids` when non-empty; `ChatMessage.applied_file_ids`; capture from delta +
  complete; cleared on retry (alongside `applied_skills`).
- `src/routes/(app)/chats/[id]/messages/+server.ts` (+ test) — parse + forward `file_ids`
  (array of strings) in the payload.
- `src/lib/components/Composer.svelte` (+ tests) — `fileAttach` prop; file chips; paperclip
  button + hidden file input; drag-drop on the composer; `onsubmit` 5th arg `fileIds`; Send gate.
- `src/lib/components/Message.svelte` (+ test) — `📎 N` indicator from `applied_file_ids`.
- `src/routes/(app)/chats/[id]/+page.svelte` — `createFileAttach`; `submit` 5-arg → `chat.send`;
  `onMount` replay passes `data.draftFileIds ?? []`; `dispose()` on destroy.
- `src/routes/(app)/chats/[id]/+page.server.ts` — read+delete `donna_draft_file_ids` →
  `draftFileIds`.
- `src/routes/(app)/+page.svelte` — `createFileAttach`; hidden `file_ids` field; pass to Composer.
- `src/routes/(app)/+page.server.ts` — `?/start` reads `file_ids` field → cookie.

## `createFileAttach` controller

```
AttachedFile = {
  localId: string;                  // crypto.randomUUID(), stable list key
  name: string;                     // original filename (for the chip + count)
  fileId: string | null;           // backend File.id once uploaded
  status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;                  // failure reason (upload error / 413 / ingestion_error)
}
```

State: `attached: AttachedFile[]`. Mirrors `createSkillAttach`'s shape (getters + methods).

- `attach(files: File[], fetchFn = fetch)` — for each browser `File`, while `attached.length <
  16`: push an entry `{ localId, name, fileId: null, status: 'uploading' }`; POST a `FormData`
  (`fd.append('file', file, file.name)`) to `/files`; on a non-OK response set
  `status: 'failed'` + `error` (read the error message; the `/files` proxy already maps 413 to a
  size message); on 201 read the `File`, set `fileId` and `status` from `ingestion_status` (default
  `pending`); if not already `ready`/`failed`, start polling. Files beyond the 16-cap are dropped
  with a one-time note (`capNote`).
- Polling: a 2 s `setInterval` per uploading file (cadence matches `KbFileRow`), GET
  `/files/{fileId}`, update `status`/`error`; clear the interval on `ready`/`failed`; a 5-minute
  stuck cap clears the interval and sets `status: 'failed'` with a timeout message. Poll fetch
  errors are tolerated (keep polling until the cap).
- `remove(localId)` — clear that file's interval and drop the entry.
- `dispose()` — clear all intervals (called from the page `onDestroy`).
- Getters: `.fileIds` → `attached.filter(f => f.status === 'ready' && f.fileId).map(f => f.fileId)`;
  `.allReady` → `attached.every(f => f.status === 'ready')` (empty list → true); `.attached`.

Reuses `IngestionStatus`/`statusBadge`/`formatBytes` from `src/lib/matters/files/uploadFile.ts`
and the existing BFF routes `/files` (POST) + `/files/[id]` (GET). No new BFF route.

## Composer

- New optional prop `fileAttach: ReturnType<typeof createFileAttach>`.
- **Chips:** for each `fileAttach.attached`, a chip with the filename, a status indicator
  (uploading/processing spinner, `ready` check, `failed` error styling via `statusBadge` tones),
  and a remove button (`fileAttach.remove(localId)`), rendered near the skill chips.
- **Paperclip button** in the toolbar (next to `SkillAttach`) triggers a hidden
  `<input type="file" multiple>`; its `change` handler calls `fileAttach.attach([...files])` then
  resets the input value (so re-selecting the same file re-fires).
- **Drag-drop:** `ondragover`/`ondragleave`/`ondrop` on the composer root; `drop` calls
  `fileAttach.attach(Array.from(e.dataTransfer.files))`; a drag-active ring while dragging.
- `onsubmit` type → `(text, model, skills, skillInputs, fileIds: string[]) => void`. `submit()`
  early-returns when `fileAttach && !fileAttach.allReady`, and passes `fileAttach?.fileIds ?? []`.
- Send button `disabled` = `!value.trim() || !(skillAttach?.allRequiredFilled ?? true) ||
  !(fileAttach?.allReady ?? true)`.

## Send paths

- **Chat:** `Composer.onsubmit` → `submit(text, model, skills, skillInputs, fileIds)` →
  `chat.send(..., fileIds)` → `chatStream` POST body `file_ids` (when non-empty) → BFF forwards
  in the `MessageCreate` payload → backend. `retry()` reuses `lastFileIds`. `applied_file_ids` is
  captured from the delta + complete frames into `ChatMessage.applied_file_ids` (parallel to
  `applied_skills`) and cleared on retry.
- **Landing:** hidden `<input name="file_ids" value={JSON.stringify(fileAttach.fileIds)}>` in the
  `?/start` form → the action parses it (`parseDraftFileIds`) and sets `donna_draft_file_ids`
  (same cookie opts/maxAge as `donna_draft_skills`) when non-empty → chat `load` reads+deletes it
  → `data.draftFileIds` → `onMount` replay sends it on the first message.

`parseDraftFileIds(raw)` returns a safe `string[]` (mirrors `parseDraftSkills`: tolerant of
missing/malformed JSON, drops non-string/empty entries).

## Message indicator

In `Message.svelte`, inside the existing `showPills` "done" toolbar row, when
`message.applied_file_ids?.length`, render a small indicator: a paperclip icon (`@lucide/svelte`)
+ `{n} file{n === 1 ? '' : 's'}`, beside the "Applied:" skills block.

## Error handling

- Upload failure / 413 / failed ingestion → chip shows `failed` + reason; `.allReady` is false so
  Send stays blocked until the file is removed.
- `/files/{id}` poll transient errors are tolerated (poll continues to the 5-min cap, then fails).
- A bad/foreign `file_id` reaching the backend returns 404 → surfaced via the existing chatStream
  non-OK handling (the 400 detail path also covers other 4xx detail strings).

## Testing

- **Controller** (`fileAttach.svelte.test.ts`, fake timers + injected `fetchFn`): upload→ready
  happy path; poll pending→processing→ready transition; upload non-OK → failed; `.fileIds` returns
  only ready ids; `.allReady` false while processing and while failed, true when all ready / when
  empty; 16-file cap; `remove` and `dispose` stop polling (no further fetches after).
- **Composer** (extend `Composer.svelte.test.ts`): paperclip button present and opens the hidden
  input; an attached chip renders with the filename; Send disabled while a file is non-ready and
  enabled once ready. (Use a real `createFileAttach` with a mocked fetch, awaiting upload.)
- **chatStream** (extend): `file_ids` in the POST body when provided + omitted when empty; reused
  on retry; `applied_file_ids` captured from a delta frame and from the complete frame; cleared on
  retry.
- **messages BFF** (extend): `file_ids` forwarded when a string array; omitted when absent/
  malformed.
- **Message** (extend `Message.svelte.test.ts`): `📎 1 file` / `📎 2 files` shown when
  `applied_file_ids` present (and singular/plural), absent when empty.
- **Landing draft** (`draftFileIds.test.ts`): mirrors `parseDraftSkills` cases.
- **Live e2e** (`tests/chat-file-attach.spec.ts`): in the chat composer, attach a small text file
  (created in the test's temp dir), wait for the chip to reach `ready`, assert Send enables, send,
  and assert the turn streams to completion with the `📎 1 file` indicator. **Planning step:**
  confirm a small `.txt`/`.pdf` ingests to `ready` on the dev stack quickly; if ingestion of the
  chosen type is slow/unsupported, pick a supported small type (the matter/KB e2es already upload
  files — reuse a known-good fixture/type). Rebuild `donna-web` before the live run.

## Acceptance criteria

- [ ] Paperclip button + drag-drop attach files; each uploads and shows status; >16 are dropped
      with a note.
- [ ] Send is blocked until every attached file is `ready`; a failed file blocks until removed.
- [ ] Sending includes `file_ids` (ready ids only, ≤16); the BFF forwards it; empty → omitted.
- [ ] Files attached on the landing composer reach the first message via the draft cookie.
- [ ] The completed turn shows a `📎 N file(s)` indicator (correct singular/plural).
- [ ] `retry()` reuses the same `file_ids`; `applied_file_ids` cleared before re-stream.
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`); unit/component tests green; live e2e green.

## Out of scope

KB/persistent attach, binding `file_id` to a skill `type:file` input (not supported upstream),
inline file previews, reading `applied_file_ids` on reloaded history (backend echoes it only on
the send/complete frame), and client-side file-type restrictions (the backend validates).
