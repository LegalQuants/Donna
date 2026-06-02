# Chat File-Attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach ad-hoc files to a chat turn (upload + readiness-gated) and send them as `MessageCreate.file_ids`, surfacing the echoed `applied_file_ids`.

**Architecture:** A new `createFileAttach` controller uploads each file via the existing `/files` BFF proxy and polls `/files/{id}` to `ready`; the composer renders file chips + a paperclip/drag-drop affordance and gates Send on readiness; ready `file_id`s thread through `chatStream` → messages BFF → backend and via the landing draft cookie. `applied_file_ids` is captured from the SSE frames and shown as a 📎 indicator.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind (`mlq-*` tokens), Vitest + @testing-library/svelte (fake timers for polling), Playwright.

---

## File Structure

- **New:** `src/lib/files/types.ts` — `AttachedFile` + `FileMeta` (generated `File`).
- **New:** `src/lib/files/fileAttach.svelte.ts` (+ `.svelte.test.ts`) — upload/poll controller.
- **New:** `src/routes/(app)/chats/[id]/draftFileIds.ts` (+ `draftFileIds.test.ts`).
- **Modify:** `src/lib/chat/sse.ts` — `applied_file_ids` on delta + complete.message.
- **Modify:** `src/lib/chat/chatStream.svelte.ts` (+ test) — `fileIds` arg, `file_ids` body, `applied_file_ids` capture, retry reuse/clear.
- **Modify:** `src/routes/(app)/chats/[id]/messages/+server.ts` (+ test) — forward `file_ids`.
- **Modify:** `src/lib/components/Message.svelte` (+ test) — 📎 indicator.
- **Modify:** `src/routes/(app)/+page.server.ts`, `chats/[id]/+page.server.ts` — landing draft cookie.
- **Modify:** `src/lib/components/Composer.svelte` (+ test), `src/routes/(app)/+page.svelte`, `chats/[id]/+page.svelte` — composer + call sites.
- **New:** `tests/chat-file-attach.spec.ts` — live e2e.

Reuses existing `/files` (POST) + `/files/[id]` (GET) BFF routes and `statusBadge`/`formatBytes` from `src/lib/matters/files/uploadFile.ts`. The 16-file cap and ready-only `file_ids` are enforced client-side; the backend re-validates.

---

## Task 1: `createFileAttach` controller + types

**Files:**
- Create: `src/lib/files/types.ts`
- Create: `src/lib/files/fileAttach.svelte.ts`
- Test: `src/lib/files/fileAttach.svelte.test.ts`

- [ ] **Step 1: Create the types**

Create `src/lib/files/types.ts`:
```ts
import type { components } from '$lib/api/backend';

/** Backend file metadata (named FileMeta so it doesn't shadow the DOM `File`). */
export type FileMeta = components['schemas']['File'];

/** A file the user has attached to a composer turn. */
export interface AttachedFile {
  localId: string;
  name: string;
  fileId: string | null;
  status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
}
```

- [ ] **Step 2: Write the failing controller tests**

Create `src/lib/files/fileAttach.svelte.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileAttach } from './fileAttach.svelte';

const uploadRes = (status: string, id = 'f1') =>
  new Response(JSON.stringify({ id, filename: 'a.txt', ingestion_status: status }), { status: 201 });
const metaRes = (status: string, id = 'f1') =>
  new Response(JSON.stringify({ id, ingestion_status: status }), { status: 200 });
const file = (name = 'a.txt') => new File(['x'], name, { type: 'text/plain' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createFileAttach', () => {
  it('starts empty', () => {
    const fa = createFileAttach();
    expect(fa.attached).toEqual([]);
    expect(fa.fileIds).toEqual([]);
    expect(fa.allReady).toBe(true);
  });

  it('uploads to ready immediately and exposes the file id', async () => {
    const fa = createFileAttach();
    const f = vi.fn().mockResolvedValue(uploadRes('ready'));
    await fa.attach([file()], f);
    expect(f.mock.calls[0][0]).toBe('/files');
    expect((f.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(fa.attached[0].status).toBe('ready');
    expect(fa.fileIds).toEqual(['f1']);
    expect(fa.allReady).toBe(true);
  });

  it('polls pending → processing → ready and gates allReady until ready', async () => {
    const fa = createFileAttach();
    const f = vi
      .fn()
      .mockResolvedValueOnce(uploadRes('pending'))
      .mockResolvedValueOnce(metaRes('processing'))
      .mockResolvedValueOnce(metaRes('ready'));
    await fa.attach([file()], f);
    expect(fa.attached[0].status).toBe('pending');
    expect(fa.allReady).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fa.attached[0].status).toBe('processing');
    expect(fa.allReady).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fa.attached[0].status).toBe('ready');
    expect(fa.fileIds).toEqual(['f1']);
    expect(f.mock.calls[1][0]).toBe('/files/f1');
  });

  it('marks failed (and blocks allReady) on a non-OK upload', async () => {
    const fa = createFileAttach();
    const f = vi.fn().mockResolvedValue(new Response('too big', { status: 413 }));
    await fa.attach([file()], f);
    expect(fa.attached[0].status).toBe('failed');
    expect(fa.allReady).toBe(false);
    expect(fa.fileIds).toEqual([]);
  });

  it('fileIds returns only ready files', async () => {
    const fa = createFileAttach();
    const f = vi
      .fn()
      .mockResolvedValueOnce(uploadRes('ready', 'r1'))
      .mockResolvedValueOnce(uploadRes('processing', 'p1'));
    await fa.attach([file('r.txt')], f);
    await fa.attach([file('p.txt')], f);
    expect(fa.fileIds).toEqual(['r1']);
    expect(fa.allReady).toBe(false);
  });

  it('caps at 16 files and flags capNote', async () => {
    const fa = createFileAttach();
    const f = vi.fn().mockResolvedValue(uploadRes('ready'));
    await fa.attach(Array.from({ length: 18 }, (_, i) => file(`f${i}.txt`)), f);
    expect(fa.attached.length).toBe(16);
    expect(fa.capNote).toBe(true);
  });

  it('remove stops the poll (no further fetches)', async () => {
    const fa = createFileAttach();
    const f = vi.fn().mockResolvedValueOnce(uploadRes('pending')).mockResolvedValue(metaRes('processing'));
    await fa.attach([file()], f);
    const localId = fa.attached[0].localId;
    const callsBefore = f.mock.calls.length;
    fa.remove(localId);
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.mock.calls.length).toBe(callsBefore);
    expect(fa.attached).toEqual([]);
  });

  it('dispose stops all polls', async () => {
    const fa = createFileAttach();
    const f = vi.fn().mockResolvedValueOnce(uploadRes('pending')).mockResolvedValue(metaRes('processing'));
    await fa.attach([file()], f);
    const callsBefore = f.mock.calls.length;
    fa.dispose();
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.mock.calls.length).toBe(callsBefore);
  });
});
```

- [ ] **Step 3: Run to verify FAIL**

Run: `npx vitest run src/lib/files/fileAttach.svelte.test.ts`
Expected: FAIL — controller does not exist.

- [ ] **Step 4: Implement the controller**

Create `src/lib/files/fileAttach.svelte.ts`:
```ts
import type { FileMeta, AttachedFile } from './types';

const MAX_FILES = 16;
const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 min at 2s, mirrors KbFileRow's stuck cap

export function createFileAttach() {
  let attached = $state<AttachedFile[]>([]);
  let capNote = $state(false);
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const entry = (localId: string) => attached.find((f) => f.localId === localId);

  function clearTimer(localId: string) {
    const t = timers.get(localId);
    if (t) {
      clearInterval(t);
      timers.delete(localId);
    }
  }

  function startPoll(localId: string, fetchFn: typeof fetch) {
    let polls = 0;
    const t = setInterval(async () => {
      polls += 1;
      const e = entry(localId);
      if (!e || !e.fileId) {
        clearTimer(localId);
        return;
      }
      if (polls > MAX_POLLS) {
        e.status = 'failed';
        e.error = 'Timed out processing this file.';
        clearTimer(localId);
        return;
      }
      try {
        const res = await fetchFn(`/files/${e.fileId}`);
        if (!res.ok) return; // tolerate transient errors; keep polling
        const file = (await res.json()) as FileMeta;
        const s = file.ingestion_status ?? 'pending';
        e.status = s;
        if (s === 'failed') e.error = file.ingestion_error ?? 'Could not process this file.';
        if (s === 'ready' || s === 'failed') clearTimer(localId);
      } catch {
        /* tolerate; keep polling */
      }
    }, POLL_MS);
    timers.set(localId, t);
  }

  async function uploadOne(localId: string, file: File, fetchFn: typeof fetch) {
    const e = entry(localId);
    if (!e) return;
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetchFn('/files', { method: 'POST', body: fd });
      if (!res.ok) {
        e.status = 'failed';
        e.error = res.status === 413 ? 'File is too large.' : 'Upload failed.';
        return;
      }
      const uploaded = (await res.json()) as FileMeta;
      e.fileId = uploaded.id;
      const s = uploaded.ingestion_status ?? 'pending';
      e.status = s;
      if (s === 'failed') e.error = uploaded.ingestion_error ?? 'Could not process this file.';
      else if (s !== 'ready') startPoll(localId, fetchFn);
    } catch {
      e.status = 'failed';
      e.error = 'Upload failed.';
    }
  }

  return {
    get attached() {
      return attached;
    },
    get capNote() {
      return capNote;
    },
    /** Ready files' backend ids — what goes into MessageCreate.file_ids. */
    get fileIds() {
      return attached.filter((f) => f.status === 'ready' && f.fileId).map((f) => f.fileId as string);
    },
    /** True when every attached file is ready (a non-ready or failed file blocks Send). */
    get allReady() {
      return attached.every((f) => f.status === 'ready');
    },
    async attach(files: File[], fetchFn: typeof fetch = fetch) {
      capNote = false;
      for (const file of files) {
        if (attached.length >= MAX_FILES) {
          capNote = true;
          break;
        }
        const localId = crypto.randomUUID();
        attached = [...attached, { localId, name: file.name, fileId: null, status: 'uploading' }];
        await uploadOne(localId, file, fetchFn);
      }
    },
    remove(localId: string) {
      clearTimer(localId);
      attached = attached.filter((f) => f.localId !== localId);
    },
    dispose() {
      for (const t of timers.values()) clearInterval(t);
      timers.clear();
    }
  };
}
```

- [ ] **Step 5: Run to verify PASS**

Run: `npx vitest run src/lib/files/fileAttach.svelte.test.ts`
Expected: PASS — all tests.

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless). No `any`/`!` (the `as string` after the ready/fileId filter is a post-guard cast, not `!`).
```bash
git add src/lib/files/types.ts src/lib/files/fileAttach.svelte.ts src/lib/files/fileAttach.svelte.test.ts
git commit -m "feat(files): createFileAttach controller — upload, poll to ready, gating getters"
```

---

## Task 2: chatStream — `file_ids` body + `applied_file_ids` capture

**Files:**
- Modify: `src/lib/chat/sse.ts`
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts`

- [ ] **Step 1: Add `applied_file_ids` to the SSE frame types**

In `src/lib/chat/sse.ts`, add `applied_file_ids?: string[];` to the `delta` frame (after `applied_skills?: string[];`) and to the `complete` frame's `message` object (after its `applied_skills?: string[]`):
```ts
  | {
      type: 'delta';
      delta: string;
      lq_ai_message_id: string;
      routed_inference_tier?: number | null;
      applied_skills?: string[];
      applied_file_ids?: string[];
    }
  | {
      type: 'complete';
      lq_ai_message_id: string;
      message: { id: string; content: string; routed_inference_tier?: number | null; routed_provider?: string | null; applied_skills?: string[]; applied_file_ids?: string[] };
      citations?: unknown[];
      routed_inference_tier?: number | null;
    }
```

- [ ] **Step 2: Write the failing chatStream tests**

Append to `src/lib/chat/chatStream.svelte.test.ts`:
```ts
describe('createChatStream file_ids', () => {
  const okFrames = () => streamResponse([
    'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
    'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
    'data: [DONE]\n\n'
  ]);

  it('includes file_ids in the POST body when provided and reuses them on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okFrames())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(okFrames())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', [], {}, ['file-1', 'file-2']);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.file_ids).toEqual(['file-1', 'file-2']);
    await chat.retry();
    const retryBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(retryBody.file_ids).toEqual(['file-1', 'file-2']);
  });

  it('omits file_ids when none attached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okFrames())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', [], {}, []);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect('file_ids' in body).toBe(false);
  });

  it('captures applied_file_ids from the complete frame', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok","applied_file_ids":["file-1"]}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', [], {}, ['file-1']);
    expect(chat.messages[chat.messages.length - 1].applied_file_ids).toEqual(['file-1']);
  });

  it('clears applied_file_ids on retry before re-streaming', async () => {
    const withIds = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok","applied_file_ids":["file-1"]}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const noIds = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok2"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(withIds())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(noIds())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', [], {}, ['file-1']);
    expect(chat.messages[1].applied_file_ids).toEqual(['file-1']);
    await chat.retry();
    expect(chat.messages[1].applied_file_ids).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify FAIL**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — `send` doesn't accept `fileIds`; body lacks `file_ids`; `applied_file_ids` not captured/cleared.

- [ ] **Step 4: Implement the chatStream changes** in `src/lib/chat/chatStream.svelte.ts`

(a) Add `applied_file_ids?: string[];` to the `ChatMessage` interface, right after the `applied_skills?: string[];` line (~line 21):
```ts
  applied_skills?: string[];
  /** File ids the backend reported as applied to this assistant turn (turn-scoped echo). */
  applied_file_ids?: string[];
```

(b) In `applyFrame`, capture from the delta frame (after the `applied_skills` delta line ~42):
```ts
      if (frame.applied_skills) m.applied_skills = frame.applied_skills;
      if (frame.applied_file_ids) m.applied_file_ids = frame.applied_file_ids;
```
and from the complete frame (after the `applied_skills` complete line ~48):
```ts
      if (frame.message.applied_skills) m.applied_skills = frame.message.applied_skills;
      if (frame.message.applied_file_ids) m.applied_file_ids = frame.message.applied_file_ids;
```

(c) Add a `lastFileIds` field after `lastSkillInputs` (~line 58):
```ts
  let lastFileIds: string[] = [];
```

(d) Change `runStream`'s signature and body. Replace the signature + body lines:
```ts
  async function runStream(idx: number, content: string, model: string, skills: string[], skillInputs: Record<string, Record<string, unknown>>, fileIds: string[]) {
    status = 'streaming';
    controller = new AbortController();
    try {
      const body: { content: string; model: string; skills?: string[]; skill_inputs?: Record<string, Record<string, unknown>>; file_ids?: string[] } = { content, model };
      if (skills.length) body.skills = skills;
      if (Object.keys(skillInputs).length) body.skill_inputs = skillInputs;
      if (fileIds.length) body.file_ids = fileIds;
```
(Leave the rest of `runStream` unchanged.)

(e) Change `send` to accept + store + pass `fileIds`:
```ts
  async function send(content: string, model = 'smart', skills: string[] = [], skillInputs: Record<string, Record<string, unknown>> = {}, fileIds: string[] = []) {
    if (status === 'streaming') return;
    lastUserContent = content;
    lastModel = model;
    lastSkills = skills;
    lastSkillInputs = skillInputs;
    lastFileIds = fileIds;
    messages = [
      ...messages,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
      { key: crypto.randomUUID(), id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    await runStream(messages.length - 1, content, model, skills, skillInputs, fileIds);
  }
```

(f) In `retry`, clear `applied_file_ids` (after the `messages[idx].applied_skills = undefined;` line) and pass `lastFileIds`:
```ts
    messages[idx].applied_skills = undefined;
    messages[idx].applied_file_ids = undefined;
```
and update the `runStream` call:
```ts
    await runStream(idx, lastUserContent, lastModel, lastSkills, lastSkillInputs, lastFileIds);
```

- [ ] **Step 5: Run to verify PASS**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS — new + existing tests.

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add src/lib/chat/sse.ts src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(chat): thread file_ids through chatStream; capture applied_file_ids"
```

---

## Task 3: messages BFF — forward `file_ids`

**Files:**
- Modify: `src/routes/(app)/chats/[id]/messages/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/chats/[id]/messages/server.test.ts`:
```ts
describe('POST messages file_ids', () => {
  it('forwards file_ids when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', file_ids: ['f1', 'f2'] }));
    expect(sentBody().file_ids).toEqual(['f1', 'f2']);
  });

  it('omits file_ids when absent or malformed', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('file_ids' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', file_ids: 'nope' }));
    expect('file_ids' in sentBody()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the forwarding** in `src/routes/(app)/chats/[id]/messages/+server.ts`

(a) Add a `fileIds` accumulator + parse. After the `skill_inputs` parsing inside the `try`, add a `file_ids` field to the body type and this parse:
```ts
    if (Array.isArray(body.file_ids)) fileIds = body.file_ids.filter((s): s is string => typeof s === 'string');
```
Declare `let fileIds: string[] = [];` with the other `let` declarations, and extend the destructured body type with `file_ids?: unknown`.

(b) Add to the payload (after the `skill_inputs` payload line):
```ts
  if (fileIds.length) payload.file_ids = fileIds;
```
and extend the `payload` type with `file_ids?: string[]`.

For reference, the resulting `let` block + parse + payload should read:
```ts
  let content = '';
  let model = 'smart';
  let skills: string[] = [];
  let skillInputs: Record<string, Record<string, unknown>> = {};
  let fileIds: string[] = [];
  try {
    const body = (await event.request.json()) as { content?: string; model?: string; skills?: string[]; skill_inputs?: unknown; file_ids?: unknown };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
    if (Array.isArray(body.skills)) skills = body.skills.filter((s): s is string => typeof s === 'string');
    if (body.skill_inputs && typeof body.skill_inputs === 'object' && !Array.isArray(body.skill_inputs)) {
      const si: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of Object.entries(body.skill_inputs as Record<string, unknown>)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) si[k] = v as Record<string, unknown>;
      }
      skillInputs = si;
    }
    if (Array.isArray(body.file_ids)) fileIds = body.file_ids.filter((s): s is string => typeof s === 'string');
  } catch {
    content = '';
  }

  const payload: { content: string; model: string; stream: true; skills?: string[]; skill_inputs?: Record<string, Record<string, unknown>>; file_ids?: string[] } = { content, model, stream: true };
  if (skills.length) payload.skills = skills;
  if (Object.keys(skillInputs).length) payload.skill_inputs = skillInputs;
  if (fileIds.length) payload.file_ids = fileIds;
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add "src/routes/(app)/chats/[id]/messages/+server.ts" "src/routes/(app)/chats/[id]/messages/server.test.ts"
git commit -m "feat(chat): forward file_ids in the messages BFF payload"
```

---

## Task 4: `Message.svelte` — 📎 file-count indicator

**Files:**
- Modify: `src/lib/components/Message.svelte`
- Test: `src/lib/components/Message.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/components/Message.svelte.test.ts` (inside the top-level `describe('Message', ...)` block, before its closing `});`):
```ts
  it('shows a file-count indicator (plural) when applied_file_ids are present', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'af1', id: 'af1', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_file_ids: ['x', 'y'] } }
    });
    expect(getByText('2 files')).toBeInTheDocument();
  });

  it('uses the singular for one attached file', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'af2', id: 'af2', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_file_ids: ['x'] } }
    });
    expect(getByText('1 file')).toBeInTheDocument();
  });

  it('renders no file indicator when none were applied', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'af3', id: 'af3', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4 } }
    });
    expect(queryByText(/\bfiles?\b/)).toBeNull();
  });
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: FAIL — indicator not rendered.

- [ ] **Step 3: Implement the indicator** in `src/lib/components/Message.svelte`

(a) Add `Paperclip` to the lucide import:
```ts
  import { ShieldCheck, ScrollText, Paperclip } from '@lucide/svelte';
```

(b) Immediately AFTER the existing applied-skills `{#if showPills && message.applied_skills …}{/if}` block (still inside the `mt-2 flex items-center gap-2` row), add:
```svelte
          {#if showPills && message.applied_file_ids && message.applied_file_ids.length > 0}
            {@const n = message.applied_file_ids.length}
            <span class="inline-flex items-center gap-1" data-testid="applied-files">
              <Paperclip size={11} aria-hidden="true" />
              <span>{n} file{n === 1 ? '' : 's'}</span>
            </span>
          {/if}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: PASS — new + existing tests.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(chat): show an applied-files indicator on completed turns"
```

---

## Task 5: Landing draft plumbing for `file_ids`

**Files:**
- Create: `src/routes/(app)/chats/[id]/draftFileIds.ts`
- Test: `src/routes/(app)/chats/[id]/draftFileIds.test.ts`
- Modify: `src/routes/(app)/+page.server.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `src/routes/(app)/chats/[id]/draftFileIds.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseDraftFileIds } from './draftFileIds';

describe('parseDraftFileIds', () => {
  it('parses a JSON array of ids', () => {
    expect(parseDraftFileIds('["f1","f2"]')).toEqual(['f1', 'f2']);
  });
  it('returns [] for null/undefined/empty', () => {
    expect(parseDraftFileIds(null)).toEqual([]);
    expect(parseDraftFileIds(undefined)).toEqual([]);
    expect(parseDraftFileIds('')).toEqual([]);
  });
  it('returns [] for malformed JSON', () => {
    expect(parseDraftFileIds('not json')).toEqual([]);
  });
  it('drops non-string and empty entries', () => {
    expect(parseDraftFileIds('["a",1,null,"","b"]')).toEqual(['a', 'b']);
  });
  it('returns [] when the JSON is not an array', () => {
    expect(parseDraftFileIds('{"a":1}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftFileIds.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the parser**

Create `src/routes/(app)/chats/[id]/draftFileIds.ts`:
```ts
/**
 * Parse the one-shot `donna_draft_file_ids` cookie / `?/start` form field (a JSON
 * array of file UUIDs set by the landing `?/start` action) into a safe `string[]`.
 * Tolerates a missing or malformed value by returning an empty list. (Mirrors
 * `parseDraftSkills`.)
 */
export function parseDraftFileIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftFileIds.test.ts"`
Expected: PASS.

- [ ] **Step 5: Wire `?/start`** in `src/routes/(app)/+page.server.ts`

(a) Add the import near the top:
```ts
import { parseDraftFileIds } from './chats/[id]/draftFileIds';
```
(b) In the `start` action, after the `const skillInputs = …` line:
```ts
    const fileIds = parseDraftFileIds(String(data.get('file_ids') ?? ''));
```
(c) After the existing `if (Object.keys(skillInputs).length) { … donna_draft_skill_inputs … }` block:
```ts
    if (fileIds.length) {
      event.cookies.set('donna_draft_file_ids', JSON.stringify(fileIds), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 120 });
    }
```

- [ ] **Step 6: Wire the chat `load`** in `src/routes/(app)/chats/[id]/+page.server.ts`

(a) Add the import next to `parseDraftSkillInputs`:
```ts
import { parseDraftFileIds } from './draftFileIds';
```
(b) After the existing `const draftSkillInputs = parseDraftSkillInputs(rawDraftSkillInputs);` line:
```ts
  const rawDraftFileIds = event.cookies.get('donna_draft_file_ids');
  if (rawDraftFileIds) event.cookies.delete('donna_draft_file_ids', { path: '/' });
  const draftFileIds = parseDraftFileIds(rawDraftFileIds);
```
(c) Add `draftFileIds` to the returned object:
```ts
  return { chatId: event.params.id, messages, draft, draftSkills, draftSkillInputs, draftFileIds, matter };
```

- [ ] **Step 7: Gate + commit**

Run: `npm run check` → 0/0. Run `npx vitest run "src/routes/(app)/chats/[id]/draftFileIds.test.ts"` → PASS.
```bash
git add "src/routes/(app)/chats/[id]/draftFileIds.ts" "src/routes/(app)/chats/[id]/draftFileIds.test.ts" "src/routes/(app)/+page.server.ts" "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat(chat): carry file_ids through the landing draft cookie"
```

---

## Task 6: Composer file UI + gating + call sites

**Files:**
- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.svelte.test.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`
- Modify: `src/routes/(app)/+page.svelte`

- [ ] **Step 1: Write the failing composer tests**

Append to `src/lib/components/Composer.svelte.test.ts`:
```ts
import { createFileAttach } from '$lib/files/fileAttach.svelte';

describe('Composer file attach', () => {
  const fileRes = (status: string) =>
    new Response(JSON.stringify({ id: 'f1', filename: 'a.txt', ingestion_status: status }), { status: 201 });

  it('renders the paperclip attach button when fileAttach is provided', () => {
    const fa = createFileAttach();
    render(Composer, { props: { value: '', fileAttach: fa } as never });
    expect(screen.getByTestId('file-attach')).toBeInTheDocument();
  });

  it('shows a ready file chip and keeps Send enabled', async () => {
    const fa = createFileAttach();
    await fa.attach([new File(['x'], 'a.txt')], vi.fn().mockResolvedValue(fileRes('ready')));
    render(Composer, { props: { value: 'hello', fileAttach: fa } as never });
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('disables Send when an attached file failed', async () => {
    const fa = createFileAttach();
    await fa.attach([new File(['x'], 'a.txt')], vi.fn().mockResolvedValue(new Response('no', { status: 413 })));
    render(Composer, { props: { value: 'hello', fileAttach: fa } as never });
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: FAIL — no paperclip / chips / gating.

- [ ] **Step 3: Implement the composer changes** in `src/lib/components/Composer.svelte`

(a) Extend the lucide import and add the file imports (with the other imports):
```ts
  import { ArrowRight, Square, X, Sparkles, Paperclip } from '@lucide/svelte';
  import { statusBadge } from '$lib/matters/files/uploadFile';
  import type { createFileAttach } from '$lib/files/fileAttach.svelte';
```

(b) Add `fileAttach` to the props destructure + type (alongside `skillAttach`):
```ts
    fileAttach,
```
and in the type block:
```ts
    fileAttach?: ReturnType<typeof createFileAttach>;
```

(c) Add local state (near `let textarea`):
```ts
  let fileInput = $state<HTMLInputElement>();
  let dragging = $state(false);
```

(d) Change the `onsubmit` prop type to 5-arg:
```ts
    onsubmit?: (text: string, model: string, skills: string[], skillInputs: Record<string, Record<string, unknown>>, fileIds: string[]) => void;
```

(e) Replace `submit()`:
```ts
  function submit() {
    const text = value.trim();
    if (!text) return;
    if (skillAttach && !skillAttach.allRequiredFilled) return;
    if (fileAttach && !fileAttach.allReady) return;
    onsubmit?.(text, modelStore.selectedModel, skillAttach?.names ?? [], skillAttach?.skillInputs ?? {}, fileAttach?.fileIds ?? []);
  }
```

(f) Add drag-drop to the root div. Replace the opening composer `<div>`:
```svelte
<div class="rounded-t-mlq-composer border bg-mlq-surface p-3 shadow-sm {dragging ? 'border-mlq-workflow' : 'border-mlq-subtle'}">
```
with (the `svelte-ignore` keeps the 0-warning bar; the drop target is a convenience layered over the explicit paperclip button):
```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rounded-t-mlq-composer border bg-mlq-surface p-3 shadow-sm {dragging ? 'border-mlq-workflow' : 'border-mlq-subtle'}"
  ondragover={(e) => { if (fileAttach) { e.preventDefault(); dragging = true; } }}
  ondragleave={() => (dragging = false)}
  ondrop={(e) => { if (fileAttach) { e.preventDefault(); dragging = false; const fs = e.dataTransfer?.files; if (fs?.length) fileAttach.attach(Array.from(fs)); } }}
>
```

(g) Render file chips. Immediately AFTER the skill chips `{#if skillAttach && skillAttach.attached.length} … {/if}` block (and before the SkillInputForm block), add:
```svelte
  {#if fileAttach && fileAttach.attached.length}
    <div class="mb-2 flex flex-wrap gap-1.5">
      {#each fileAttach.attached as f (f.localId)}
        <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs {f.status === 'failed' ? 'border-mlq-error/40 text-mlq-error' : 'border-mlq-subtle text-mlq-text'}">
          <Paperclip size={11} aria-hidden="true" />
          {f.name}
          <span class="text-mlq-muted">· {f.status === 'uploading' ? 'uploading' : statusBadge(f.status).label.toLowerCase()}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onclick={() => fileAttach?.remove(f.localId)} class="text-mlq-muted hover:text-mlq-text"><X size={12} /></button>
        </span>
      {/each}
    </div>
  {/if}
  {#if fileAttach?.capNote}<p class="mb-2 text-xs text-mlq-muted">Up to 16 files per message.</p>{/if}
```

(h) Add the paperclip button + hidden input in the toolbar, immediately AFTER the `{#if skillAttach}<SkillAttach … />{/if}` block:
```svelte
    {#if fileAttach}
      <input
        type="file"
        multiple
        bind:this={fileInput}
        data-testid="file-attach-input"
        onchange={(e) => { const fs = e.currentTarget.files; if (fs?.length) fileAttach?.attach(Array.from(fs)); e.currentTarget.value = ''; }}
        class="hidden"
      />
      <button type="button" data-testid="file-attach" aria-label="Attach files" onclick={() => fileInput?.click()} class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">
        <Paperclip size={13} />
      </button>
    {/if}
```

(i) Gate the Send button. Replace its `disabled` attribute:
```svelte
      <button type="button" onclick={submit} disabled={!value.trim() || !(skillAttach?.allRequiredFilled ?? true) || !(fileAttach?.allReady ?? true)} aria-label="Send" class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40">
        <ArrowRight size={18} />
      </button>
```

- [ ] **Step 4: Run the composer tests to verify PASS**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: PASS — new + existing.

- [ ] **Step 5: Wire the chat page** `src/routes/(app)/chats/[id]/+page.svelte`

(a) Add imports:
```ts
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { createFileAttach } from '$lib/files/fileAttach.svelte';
```
(replace the existing `import { onMount, tick, untrack } from 'svelte';` line with the `onDestroy` form above; add the `createFileAttach` import with the other `$lib` imports).

(b) Create the controller (next to `const skillAttach = createSkillAttach();`):
```ts
  const fileAttach = createFileAttach();
```

(c) Replace `submit` (5-arg):
```ts
  function submit(text: string, model = 'smart', skills: string[] = [], skillInputs: Record<string, Record<string, unknown>> = {}, fileIds: string[] = []) {
    draftValue = '';
    chat.send(text, model, skills, skillInputs, fileIds);
  }
```

(d) Replace the `onMount` replay line:
```ts
    if (data.draft && data.messages.length === 0) submit(data.draft, modelStore.selectedModel, data.draftSkills ?? [], data.draftSkillInputs ?? {}, data.draftFileIds ?? []);
```

(e) Add cleanup after `onMount(...)`:
```ts
  onDestroy(() => fileAttach.dispose());
```

(f) Pass `fileAttach` to the `<Composer>` (add to its prop list, e.g. after `{skillAttach}`):
```svelte
        {skillAttach}
        {fileAttach}
```

- [ ] **Step 6: Wire the landing page** `src/routes/(app)/+page.svelte`

(a) Add imports:
```ts
  import { onDestroy } from 'svelte';
  import { createFileAttach } from '$lib/files/fileAttach.svelte';
```

(b) Create the controller (next to `const skillAttach = createSkillAttach();`) and dispose on destroy:
```ts
  const fileAttach = createFileAttach();
  onDestroy(() => fileAttach.dispose());
```

(c) Add the hidden field inside the form, after the `skill_inputs` hidden input:
```svelte
    <input type="hidden" name="file_ids" value={JSON.stringify(fileAttach.fileIds)} />
```

(d) Pass `fileAttach` to `<Composer>`:
```svelte
    <Composer bind:value={message} matters={data.matters} bind:selectedMatterId {skillAttach} {fileAttach} {promptLibrary} onsubmit={() => formEl?.requestSubmit()} />
```

- [ ] **Step 7: Full gate + commit**

Run: `npm run check` → 0/0 (confirm no a11y warning from the drag handlers — the `svelte-ignore` covers it). Run `npx vitest run` → full suite green.
```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.svelte.test.ts "src/routes/(app)/chats/[id]/+page.svelte" "src/routes/(app)/+page.svelte"
git commit -m "feat(composer): paperclip + drag-drop file attach, readiness gate, thread file_ids"
```

---

## Task 7: Live e2e

**Files:**
- Create: `tests/chat-file-attach.spec.ts`

- [ ] **Step 1: Confirm a small file ingests to ready quickly**

The dev stack must be up. The matter/KB e2es already upload files, so a small `.txt` is known-good. Sanity-check the ingestion of a tiny text file reaches `ready` within ~30 s on this stack (the composer chip will show `ready`). If `.txt` is unsupported, use a tiny `.pdf` (the repo's RAG e2es use `/tmp/spike.pdf`-style fixtures; regenerate via `cupsfilter` if needed). Note which type you used.

- [ ] **Step 2: Write the e2e**

Create `tests/chat-file-attach.spec.ts` (creates its own fixture file in the OS temp dir so the test is self-contained):
```ts
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('composer: attach a file, wait for ready, send, see the file indicator', async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = join(tmpdir(), `donna-attach-${Date.now()}.txt`);
  writeFileSync(fixture, 'This contract terminates after thirty days notice.\n');

  await login(page);
  await page.getByPlaceholder(/ask a question/i).fill('Summarize the attached file.');

  // Attach via the hidden file input behind the paperclip.
  await page.getByTestId('file-attach-input').setInputFiles(fixture);

  // Chip appears; Send stays disabled until the file ingests to ready.
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();
  await expect(page.getByText(/ready/i)).toBeVisible({ timeout: 120_000 });
  await expect(send).toBeEnabled();

  await send.click();
  await page.waitForURL(/\/chats\//, { timeout: 15_000 });
  await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 60_000 });
  // The completed turn echoes the attached file.
  await expect(page.getByTestId('applied-files')).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: Rebuild donna-web and run**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/chat-file-attach.spec.ts
```
Expected: PASS. If the file never reaches `ready` (ingestion slow/unsupported for the chosen type), switch the fixture to a supported type (per Step 1) rather than loosening assertions. If the backend doesn't echo `applied_file_ids` for an ingested file, report it (it's a backend-contract issue) rather than removing the indicator assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/chat-file-attach.spec.ts
git commit -m "test(files): live e2e for chat file attach"
```

---

## Final Verification (run after all tasks)

- [ ] `npm run check` → 0 errors / 0 warnings.
- [ ] `npx vitest run` → full suite green.
- [ ] `set -a; . ./.env; set +a; docker compose up -d --build donna-web && npx playwright test tests/chat-file-attach.spec.ts` → green.
- [ ] Manual: attach via paperclip and via drag-drop; chips show status; Send blocked until ready; a failed/oversize file blocks until removed; the sent turn shows 📎 N.

## Acceptance criteria (from the spec)

- [ ] Paperclip + drag-drop attach; per-file status; >16 dropped with a note.
- [ ] Send blocked until every file is ready; failed blocks until removed.
- [ ] `file_ids` (ready only, ≤16) sent + forwarded by the BFF; empty omitted.
- [ ] Landing-composer files reach the first message via the cookie.
- [ ] Completed turn shows 📎 N (singular/plural correct).
- [ ] `retry()` reuses `file_ids`; `applied_file_ids` cleared before re-stream.
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`); unit/component tests green; live e2e green.
