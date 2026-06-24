# Sticky Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-chat "Keep skills on" toggle to Donna's in-chat composer that carries applied skills across follow-up turns, driven by lq-ai's sticky-skills backend (`5ad9f9e`), then ship it as the 0.3.0 release (docs, version bump, new images, new DMG).

**Architecture:** A new `set_sticky` request field threads `Composer → chatStream.send → BFF proxy → lq-ai`, sent only when the user flipped the toggle this turn. The chat's `sticky_skills` set is read on page load (`GET /chats/{id}`, honest-degradation to off) and feeds a small `createStickySkills` rune controller that drives a `role="switch"` toggle plus a quiet "Keeping N on" indicator.

**Tech Stack:** SvelteKit (adapter-node), Svelte 5 runes, TypeScript, Vitest (unit/component + form-action server tests), Playwright (live e2e), the pinned `vendor/lq-ai` submodule + generated `src/lib/api/backend.d.ts`.

**Spec:** `docs/superpowers/specs/2026-06-23-sticky-skills-design.md`

## Global Constraints

- **Never edit `vendor/lq-ai`.** Pin bump only (`git -C vendor/lq-ai checkout <sha>`); regenerate types via `npm run gen:api`.
- **Gates (green, not "no worse"):** `npm run check` = 0 errors / 0 warnings; `npm run lint` = prettier + eslint clean; `npx vitest run` passes.
- **Svelte 5 runes** throughout (`$props`, `$state`, `$derived`, `$effect`); seed reactive controllers from `data` via `untrack`/id-guards to avoid `state_referenced_locally`.
- **Tabs for indentation** (prettier-enforced); match the neighboring file's style.
- **Defensive parsers at the data boundary** (`parseXList(raw: unknown)` with local guards that drop malformed rows rather than throw).
- **Honest degradation:** a failed sub-fetch degrades to a safe default (sticky off); never break the page or fabricate state.
- **Form-action / proxy server tests:** mock `lqStream`/`lqFetch`, build a `Request`, assert the forwarded payload.
- **Live e2e** run against the running stack, self-cleaning via `try/finally`. `.txt` won't ingest — use `.pdf` fixtures for ingestion.
- **Commit + push per task.** Merge the PR to `main` with a **MERGE COMMIT** (never squash — preserves the `.git-blame-ignore-revs` SHAs).
- **Backend contract (verify post-`gen:api`, merged shape wins):** message-create `set_sticky?: boolean | null`; Chat response `sticky_skills: string[]`.
- **Release version:** `0.3.0` (product) and desktop launcher `0.3.0`; image tag `v0.3.0`; desktop tag `desktop-v0.3.0`.

---

### Task 1: Bump the lq-ai pin and regenerate the contract

**Files:**
- Modify: `vendor/lq-ai` (submodule pointer → `5ad9f9e`)
- Modify: `src/lib/api/backend.d.ts` (regenerated)
- Modify: `docs/decisions/lq-ai-pin.md` (append the bump)

**Interfaces:**
- Produces: the generated types `Chat.sticky_skills: string[]` and message-create `set_sticky?: boolean | null` in `backend.d.ts`, consumed by Tasks 2–6.

- [ ] **Step 1: Bump the submodule pin**

```bash
cd vendor/lq-ai && git fetch origin && git checkout 5ad9f9e && cd ../..
git -C vendor/lq-ai log -1 --oneline   # expect: 5ad9f9e feat(chat): opt-in sticky-skills toggle (#211)
```

- [ ] **Step 2: Regenerate the typed API client**

Run: `npm run gen:api`
Expected: completes; `src/lib/api/backend.d.ts` changes.

- [ ] **Step 3: Verify the new contract landed (merged shape wins)**

Run: `grep -n 'sticky_skills\|set_sticky' src/lib/api/backend.d.ts`
Expected: `Chat` has `sticky_skills: string[]`; the message-create request body has `set_sticky?: boolean | null`. If either is typed loosely (`additionalProperties` / `unknown`), note it — the parser in Task 2 / proxy in Task 6 hand-types it.

- [ ] **Step 4: Rebuild the stack so migration 0056 runs**

```bash
set -a; . ./.env; set +a
docker compose up -d --build api arq-worker ingest-worker donna-web
```
Expected: `api` boots, applies `0056_chat_sticky_skills`; `docker compose ps` shows healthy.

- [ ] **Step 5: Record the bump**

Append to `docs/decisions/lq-ai-pin.md` (top of the bump log): the new SHA `5ad9f9e`, date `2026-06-23`, and what it unblocked ("per-chat sticky skills — `chats.sticky_skills`, message-create `set_sticky`").

- [ ] **Step 6: Gate + commit**

```bash
npm run check    # 0/0
git add vendor/lq-ai src/lib/api/backend.d.ts docs/decisions/lq-ai-pin.md
git commit -m "chore(pin): bump lq-ai to 5ad9f9e for sticky skills"
git push
```

---

### Task 2: `parseChat` defensive parser

**Files:**
- Create: `src/lib/chat/chat.ts`
- Test: `src/lib/chat/chat.test.ts`

**Interfaces:**
- Produces: `parseChat(raw: unknown): { stickySkills: string[] }` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseChat } from './chat';

describe('parseChat', () => {
	it('extracts sticky_skills as a string array', () => {
		expect(parseChat({ id: 'c1', sticky_skills: ['a', 'b'] }).stickySkills).toEqual(['a', 'b']);
	});
	it('drops non-string entries', () => {
		expect(parseChat({ sticky_skills: ['a', 2, null, 'b'] }).stickySkills).toEqual(['a', 'b']);
	});
	it('returns [] when sticky_skills is missing or not an array', () => {
		expect(parseChat({ id: 'c1' }).stickySkills).toEqual([]);
		expect(parseChat({ sticky_skills: 'nope' }).stickySkills).toEqual([]);
	});
	it('returns [] for non-object input', () => {
		expect(parseChat(null).stickySkills).toEqual([]);
		expect(parseChat([1, 2]).stickySkills).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chat.test.ts`
Expected: FAIL — cannot find `./chat`.

- [ ] **Step 3: Write the implementation**

```ts
// Defensive parser for the lq-ai Chat object. Donna only needs `sticky_skills` (the per-chat sticky
// set that drives the composer "Keep skills on" toggle). Drops malformed input rather than throwing;
// missing / non-array → []. Mirrors the parseXList precedent (findings.ts, artifacts.ts).
export function parseChat(raw: unknown): { stickySkills: string[] } {
	const obj =
		raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const arr = obj.sticky_skills;
	const stickySkills = Array.isArray(arr)
		? arr.filter((s): s is string => typeof s === 'string')
		: [];
	return { stickySkills };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/chat.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chat.ts src/lib/chat/chat.test.ts
git commit -m "feat(chat): parseChat — extract per-chat sticky_skills"
git push
```

---

### Task 3: Chat load returns `stickySkills`

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`
- Test: `src/routes/(app)/chats/[id]/page.server.stickyskills.test.ts`

**Interfaces:**
- Consumes: `parseChat` (Task 2).
- Produces: `data.stickySkills: string[]` on the chat page — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Mirror the existing `+page.server.test.ts` mocking style (mock `$lib/server/lqClient`). Mock `lqFetch` so the messages call returns `{ items: [] }`, the receipts/matter calls return non-ok, and `GET /api/v1/chats/{id}` returns `{ sticky_skills: ['contract-snapshot'] }`. Assert `result.stickySkills`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

function ok(json: unknown) {
	return { ok: true, status: 200, json: async () => json };
}
function notOk(status = 404) {
	return { ok: false, status, json: async () => ({}) };
}

const event = {
	params: { id: 'chat-1' },
	cookies: { get: () => undefined, delete: () => {} }
} as never;

beforeEach(() => lqFetch.mockReset());

describe('chat load — sticky skills', () => {
	it('returns the chat sticky_skills set', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string) => {
			if (path.includes('/messages?')) return ok({ items: [] });
			if (path === '/api/v1/chats/chat-1') return ok({ sticky_skills: ['contract-snapshot'] });
			return notOk();
		});
		const res = await load(event);
		expect(res.stickySkills).toEqual(['contract-snapshot']);
	});

	it('degrades to [] when the chat fetch fails', async () => {
		lqFetch.mockImplementation((_e: unknown, path: string) => {
			if (path.includes('/messages?')) return ok({ items: [] });
			if (path === '/api/v1/chats/chat-1') return notOk(502);
			return notOk();
		});
		const res = await load(event);
		expect(res.stickySkills).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/(app)/chats/[id]/page.server.stickyskills.test.ts`
Expected: FAIL — `res.stickySkills` is `undefined`.

- [ ] **Step 3: Implement the load change**

In `src/routes/(app)/chats/[id]/+page.server.ts`: add the import and the sub-fetch, and return `stickySkills`.

Add near the other imports:
```ts
import { parseChat } from '$lib/chat/chat';
```

After the `matter` resolution (`const matter = await resolveMatter(...)`), add:
```ts
	// Per-chat sticky-skills set — drives the composer "Keep skills on" toggle. Degrades to off.
	let stickySkills: string[] = [];
	try {
		const cr = await lqFetch(event, `/api/v1/chats/${event.params.id}`);
		if (cr.ok) stickySkills = parseChat(await cr.json()).stickySkills;
	} catch {
		/* leave [] — the toggle simply reads off */
	}
```

Add `stickySkills` to the returned object:
```ts
	return {
		chatId: event.params.id,
		messages,
		draft,
		draftSkills,
		draftSkillInputs,
		draftFileIds,
		matter,
		stickySkills
	};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/(app)/chats/[id]/page.server.stickyskills.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npm run check   # 0/0
git add "src/routes/(app)/chats/[id]/+page.server.ts" "src/routes/(app)/chats/[id]/page.server.stickyskills.test.ts"
git commit -m "feat(chat): load per-chat sticky_skills (honest degradation)"
git push
```

---

### Task 4: `createStickySkills` controller

**Files:**
- Create: `src/lib/skills/sticky.svelte.ts`
- Test: `src/lib/skills/sticky.svelte.test.ts`

**Interfaces:**
- Produces: `createStickySkills()` returning `{ get enabled, get set, get dirty, syncFromChat(chatId, stickySkills), toggle(currentTurnSkills), sendValue(), markSent() }` — consumed by Tasks 7 & 8.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createStickySkills } from './sticky.svelte';

describe('createStickySkills', () => {
	it('seeds enabled/set from a chat on first sync', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', ['a', 'b']);
		expect(s.enabled).toBe(true);
		expect(s.set).toEqual(['a', 'b']);
		expect(s.dirty).toBe(false);
	});

	it('starts off for an empty set', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		expect(s.enabled).toBe(false);
	});

	it('toggle flips enabled, sets dirty, and optimistically unions the turn skills', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		expect(s.enabled).toBe(true);
		expect(s.dirty).toBe(true);
		expect(s.set).toEqual(['x']);
	});

	it('toggle off clears the optimistic set', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', ['x']);
		s.toggle([]);
		expect(s.enabled).toBe(false);
		expect(s.set).toEqual([]);
	});

	it('sendValue returns dirty ? enabled : undefined', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		expect(s.sendValue()).toBeUndefined();
		s.toggle(['x']);
		expect(s.sendValue()).toBe(true);
	});

	it('markSent clears dirty', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		s.markSent();
		expect(s.dirty).toBe(false);
		expect(s.sendValue()).toBeUndefined();
	});

	it('syncFromChat is a no-op for the same chat id (never clobbers an in-progress toggle)', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']); // user flipped on, dirty
		s.syncFromChat('c1', []); // same id — must NOT reset
		expect(s.enabled).toBe(true);
		expect(s.dirty).toBe(true);
	});

	it('syncFromChat re-seeds and resets dirty when the chat id changes', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		s.syncFromChat('c2', ['y']); // new chat
		expect(s.enabled).toBe(true);
		expect(s.set).toEqual(['y']);
		expect(s.dirty).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/sticky.svelte.test.ts`
Expected: FAIL — cannot find `./sticky.svelte`.

- [ ] **Step 3: Write the implementation**

```ts
// Per-chat "sticky skills" controller (Svelte 5 runes). Mirrors the LQ-AI reference's
// stickyEnabled/stickyDirty: `enabled` is INDEPENDENT state (seeded from the chat's set length, then
// flipped by the toggle), so the switch reflects user intent before the next send reconciles the set.
// `set_sticky` is sent to the backend ONLY when the user flipped the toggle this turn (sendValue()
// returns dirty ? enabled : undefined) — sending it every turn would re-snapshot and break the
// "union for the turn, set unchanged" invariant.
export function createStickySkills() {
	let enabled = $state(false);
	let set = $state<string[]>([]);
	let dirty = $state(false);
	// Internal, non-reactive: the last chat id we synced from, so syncFromChat only acts on a change.
	let syncedChatId: string | null = null;

	const union = (a: string[], b: string[]): string[] => Array.from(new Set([...a, ...b]));

	return {
		get enabled() {
			return enabled;
		},
		get set() {
			return set;
		},
		get dirty() {
			return dirty;
		},
		// Re-seed from a freshly-loaded chat, but ONLY when the chat id changes — so a reactive re-run
		// never clobbers an in-progress toggle, and a new chat starts off.
		syncFromChat(chatId: string, stickySkills: string[]) {
			if (chatId === syncedChatId) return;
			syncedChatId = chatId;
			set = [...stickySkills];
			enabled = stickySkills.length > 0;
			dirty = false;
		},
		// Flip the switch. `currentTurnSkills` are this turn's per-turn attached skills, used to
		// optimistically show the "Keeping N on" count until the next load reconciles the real set.
		toggle(currentTurnSkills: string[]) {
			enabled = !enabled;
			dirty = true;
			set = enabled ? union(currentTurnSkills, set) : [];
		},
		// The set_sticky value to send THIS turn — only when the toggle was flipped since the last send.
		sendValue(): boolean | undefined {
			return dirty ? enabled : undefined;
		},
		// Clear the flip flag after a send that carried set_sticky was accepted.
		markSent() {
			dirty = false;
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/sticky.svelte.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/sticky.svelte.ts src/lib/skills/sticky.svelte.test.ts
git commit -m "feat(skills): createStickySkills controller (enabled/set/dirty + sync/toggle/send)"
git push
```

---

### Task 5: Thread `set_sticky` through `chatStream.send`

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts` (`runStream`, `send`, `retry`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `send(content, model?, skills?, skillInputs?, fileIds?, setSticky?): Promise<boolean>` — returns whether the POST was accepted; `body.set_sticky` is set only when `setSticky !== undefined`. Consumed by Task 8.

- [ ] **Step 1: Add `setSticky` to `runStream` and its body, and return acceptance**

In `runStream`, change the signature to add `setSticky?: boolean`, add the body field, track acceptance, and return a boolean:

```ts
	async function runStream(
		idx: number,
		content: string,
		model: string,
		skills: string[],
		skillInputs: Record<string, Record<string, unknown>>,
		fileIds: string[],
		setSticky?: boolean
	): Promise<boolean> {
		status = 'streaming';
		controller = new AbortController();
		let accepted = false;
		try {
			const body: {
				content: string;
				model: string;
				skills?: string[];
				skill_inputs?: Record<string, Record<string, unknown>>;
				file_ids?: string[];
				set_sticky?: boolean;
			} = { content, model };
			if (skills.length) body.skills = skills;
			if (Object.keys(skillInputs).length) body.skill_inputs = skillInputs;
			if (fileIds.length) body.file_ids = fileIds;
			if (setSticky !== undefined) body.set_sticky = setSticky;
			const res = await fetch(`/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				let msg = 'Could not reach the model. Please try again.';
				if (res.status === 400) {
					try {
						const env = (await res.json()) as { detail?: unknown };
						if (typeof env.detail === 'string' && env.detail) msg = env.detail;
					} catch {
						/* keep the generic message */
					}
				}
				setError(idx, msg);
				return false;
			}
			accepted = true; // POST accepted — set_sticky (if any) reached the backend
			await consumeStream(idx, res);
			return true;
		} catch (e) {
			if ((e as Error).name === 'AbortError') {
				messages[idx].status = 'done';
				status = 'idle';
			} else {
				setError(idx, 'The connection was lost. Please try again.');
			}
			return accepted; // an abort AFTER acceptance still dispatched set_sticky
		} finally {
			controller = null;
		}
	}
```

- [ ] **Step 2: Thread it through `send` (return the acceptance)**

```ts
	async function send(
		content: string,
		model = 'smart',
		skills: string[] = [],
		skillInputs: Record<string, Record<string, unknown>> = {},
		fileIds: string[] = [],
		setSticky?: boolean
	): Promise<boolean> {
		if (status === 'streaming') return false;
		lastUserContent = content;
		lastModel = model;
		lastSkills = skills;
		lastSkillInputs = skillInputs;
		lastFileIds = fileIds;
		messages = [
			...messages,
			{ key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
			{
				key: crypto.randomUUID(),
				id: 'pending',
				role: 'assistant',
				content: '',
				status: 'streaming'
			}
		];
		return await runStream(messages.length - 1, content, model, skills, skillInputs, fileIds, setSticky);
	}
```

- [ ] **Step 3: Keep `retry` from re-snapshotting**

`retry()` calls `runStream(idx, lastUserContent, lastModel, lastSkills, lastSkillInputs, lastFileIds)` — leave it WITHOUT a `setSticky` arg (it defaults to `undefined`). Add a clarifying comment above that call:

```ts
		// NB: no set_sticky on retry — the sticky set is already persisted server-side; re-snapshotting
		// on a retry would be wrong.
		await runStream(idx, lastUserContent, lastModel, lastSkills, lastSkillInputs, lastFileIds);
```

- [ ] **Step 4: Verify the suite + types still pass**

Run: `npm run check && npx vitest run src/lib/chat`
Expected: 0/0; existing chatStream tests pass (the new param is optional and additive).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts
git commit -m "feat(chat): thread set_sticky through send/runStream; return acceptance; retry omits it"
git push
```

---

### Task 6: Forward `set_sticky` in the messages BFF proxy

**Files:**
- Modify: `src/routes/(app)/chats/[id]/messages/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/server.setsticky.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the proxy forwards `set_sticky` to lq-ai when it's a boolean; omits it otherwise.

- [ ] **Step 1: Write the failing test**

Mock `lqStream` to capture the upstream payload.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn(async () => ({
	body: null,
	status: 200,
	headers: { get: () => 'text/event-stream' }
}));
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));

import { POST } from './+server';

function makeEvent(body: unknown) {
	return {
		params: { id: 'chat-1' },
		request: new Request('http://localhost/chats/chat-1/messages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}
function sentPayload() {
	return JSON.parse((lqStream.mock.calls[0][2] as { body: string }).body);
}

beforeEach(() => lqStream.mockClear());

describe('messages proxy — set_sticky', () => {
	it('forwards set_sticky:true', async () => {
		await POST(makeEvent({ content: 'hi', set_sticky: true }));
		expect(sentPayload().set_sticky).toBe(true);
	});
	it('forwards set_sticky:false', async () => {
		await POST(makeEvent({ content: 'hi', set_sticky: false }));
		expect(sentPayload().set_sticky).toBe(false);
	});
	it('omits set_sticky when absent', async () => {
		await POST(makeEvent({ content: 'hi' }));
		expect('set_sticky' in sentPayload()).toBe(false);
	});
	it('omits set_sticky when not a boolean', async () => {
		await POST(makeEvent({ content: 'hi', set_sticky: 'yes' }));
		expect('set_sticky' in sentPayload()).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.setsticky.test.ts"`
Expected: FAIL — `set_sticky` not forwarded.

- [ ] **Step 3: Implement the passthrough**

In `src/routes/(app)/chats/[id]/messages/+server.ts`:

Add to the incoming body type and a local var (top of the handler, beside the others):
```ts
	let setSticky: boolean | undefined;
```
Extend the destructured `body` type with `set_sticky?: unknown;`, and inside the `try` (after the `file_ids` parse) add:
```ts
		if (typeof body.set_sticky === 'boolean') setSticky = body.set_sticky;
```
Extend the `payload` type with `set_sticky?: boolean;` and after the existing `if (fileIds.length)` line add:
```ts
	if (setSticky !== undefined) payload.set_sticky = setSticky;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.setsticky.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
npm run check   # 0/0
git add "src/routes/(app)/chats/[id]/messages/+server.ts" "src/routes/(app)/chats/[id]/messages/server.setsticky.test.ts"
git commit -m "feat(chat): forward set_sticky through the messages BFF proxy"
git push
```

---

### Task 7: Composer — the "Keep skills on" switch + indicator

**Files:**
- Modify: `src/lib/components/Composer.svelte`

**Interfaces:**
- Consumes: `createStickySkills` (Task 4), `prettifySkillSlug` (`src/lib/skills/skillLabel.ts`).
- Produces: a `sticky?` prop; `onsubmit` gains a 6th arg `setSticky?: boolean`.

- [ ] **Step 1: Add the import and the prop**

Add to the imports:
```ts
	import type { createStickySkills } from '$lib/skills/sticky.svelte';
	import { prettifySkillSlug } from '$lib/skills/skillLabel';
```
Add `sticky` to the destructured props and the props type:
```ts
		sticky,
```
```ts
		sticky?: ReturnType<typeof createStickySkills>;
```

- [ ] **Step 2: Extend the `onsubmit` signature and pass `sendValue()`**

In the `onsubmit` type, add a 6th parameter:
```ts
		onsubmit?: (
			text: string,
			model: string,
			skills: string[],
			skillInputs: Record<string, Record<string, unknown>>,
			fileIds: string[],
			setSticky?: boolean
		) => void;
```
In `submit()`, pass `sticky?.sendValue()` as the 6th arg:
```ts
		onsubmit?.(
			text,
			modelStore.selectedModel,
			skillAttach?.names ?? [],
			skillAttach?.skillInputs ?? {},
			fileAttach?.fileIds ?? [],
			sticky?.sendValue()
		);
```

- [ ] **Step 3: Add the switch + indicator in the toolbar**

Immediately after the `{#if skillAttach}…{/if}` SkillAttach block, add:
```svelte
		{#if sticky}
			<button
				type="button"
				role="switch"
				aria-checked={sticky.enabled}
				data-testid="sticky-toggle"
				onclick={() => sticky.toggle(skillAttach?.names ?? [])}
				class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs {sticky.enabled
					? 'bg-mlq-subtle text-mlq-strong'
					: 'text-mlq-text'}"
				title="Keep the skills applied in this chat on for follow-up messages"
			>
				<span
					class="inline-block h-2 w-2 rounded-full {sticky.enabled
						? 'bg-mlq-strong'
						: 'bg-mlq-muted'}"
				></span>
				Keep skills on
				{#if sticky.enabled && sticky.set.length > 0}
					<span
						class="text-mlq-muted"
						title={sticky.set.map(prettifySkillSlug).join(', ')}
						data-testid="sticky-count">· Keeping {sticky.set.length} on</span
					>
				{/if}
			</button>
		{/if}
```

- [ ] **Step 4: Verify types/format**

Run: `npm run check && npx vitest run src/lib/components`
Expected: 0/0; existing Composer tests still pass (new prop optional; landing composer passes no `sticky`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Composer.svelte
git commit -m "feat(composer): Keep skills on switch + Keeping N on indicator (in-chat only)"
git push
```

---

### Task 8: Wire the sticky controller into the chat page

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

**Interfaces:**
- Consumes: `createStickySkills` (Task 4), `chat.send(...): Promise<boolean>` (Task 5), `data.stickySkills` (Task 3), the Composer `sticky` prop + 6th `onsubmit` arg (Task 7).

- [ ] **Step 1: Create the controller + re-sync effect**

Add the import:
```ts
	import { createStickySkills } from '$lib/skills/sticky.svelte';
```
Beside the other controllers (after `const promptLibrary = createPromptLibrary();`):
```ts
	const sticky = createStickySkills();
```
Add an effect that re-syncs on chat-id change (the controller no-ops on the same id, so this is safe to run reactively):
```ts
	// Re-sync the sticky toggle from the loaded chat. syncFromChat acts only on a chat-id change,
	// so this never clobbers an in-progress toggle, and a new chat starts off.
	$effect(() => {
		sticky.syncFromChat(data.chatId, data.stickySkills);
	});
```

- [ ] **Step 2: Thread `setSticky` through submit + markSent on success**

Replace the `submit` function:
```ts
	async function submit(
		text: string,
		model = 'smart',
		skills: string[] = [],
		skillInputs: Record<string, Record<string, unknown>> = {},
		fileIds: string[] = [],
		setSticky?: boolean
	) {
		draftValue = '';
		const ok = await chat.send(text, model, skills, skillInputs, fileIds, setSticky);
		if (ok && setSticky !== undefined) sticky.markSent();
	}
```

- [ ] **Step 3: Pass `sticky` to the Composer**

Add `{sticky}` to the `<Composer … />` props (next to `{skillAttach}`):
```svelte
				{skillAttach}
				{sticky}
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm run lint`
Expected: 0/0; prettier + eslint clean.

- [ ] **Step 5: Rebuild the running web container + commit**

```bash
docker compose up -d --build donna-web
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(chat): wire sticky-skills toggle into the chat page (sync + markSent)"
git push
```

---

### Task 9: Live e2e — the sticky carry-over loop

**Files:**
- Create: `tests/sticky-skills.spec.ts`

**Interfaces:**
- Consumes: the running stack (rebuilt `donna-web` from Task 8) + the admin fixture.

- [ ] **Step 1: Write the e2e**

Model it on `tests/applied-skills.spec.ts` / `tests/skills-authoring.spec.ts` (login helper, self-cleaning). Flow: create a chat; attach a reliably-forwarding user-skill (create one via `POST /api/v1/user-skills` with a templated body, or reuse an existing one); send and assert the assistant turn shows the skill in its applied-skills footer; flip **Keep skills on** (`[data-testid="sticky-toggle"]`); send a follow-up WITHOUT re-attaching; assert the follow-up's applied-skills footer still shows the skill; flip off; send; assert it no longer applies. `try/finally` deletes the chat (and the created skill).

```ts
import { test, expect } from '@playwright/test';
// … login(page), create-skill, create-chat helpers mirroring tests/applied-skills.spec.ts …

test('sticky skills carry across follow-up turns', async ({ page }) => {
	// 1) attach skill X, send → applied
	// 2) toggle "Keep skills on" → send follow-up w/o re-attaching → still applied
	// 3) toggle off → send → not applied
	// (assertions on the applied-skills footer; try/finally cleanup)
});
```

> **Non-determinism guard:** `applied_skills` reflects forwarded skills (deterministic for a templated user-skill), but if it proves model-influenced in practice, fall back to asserting the `set_sticky` request body reaches `/api/v1/chats/{id}/messages` (route a request listener), per the model-discretionary-output e2e guidance in CLAUDE.md §7.

- [ ] **Step 2: Run it against the stack**

```bash
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password '<pw>' --no-force-change
npx playwright test tests/sticky-skills.spec.ts
```
Expected: PASS (self-cleaning).

- [ ] **Step 3: Commit**

```bash
git add tests/sticky-skills.spec.ts
git commit -m "test(e2e): sticky skills carry across follow-up turns"
git push
```

---

### Task 10: Gates + whole-branch review

- [ ] **Step 1: Full gates**

```bash
npm run check        # 0 errors / 0 warnings
npm run lint         # prettier + eslint clean
npx vitest run       # full unit/component suite passes
```

- [ ] **Step 2: Whole-branch Opus review** (per CLAUDE.md §6) — request a review of `origin/feat/sticky-skills` vs `main`; fold any blocking findings; re-run gates.

---

### Task 11: Documentation — mention sticky skills everywhere it belongs

**Files:**
- Modify: `README.md` (the Assistant bullet in *What's inside*)
- Modify: `docs/PRODUCT.md` (capabilities)
- Modify: `docs/GUIDE.md` (the Assistant / Workflows section)
- Modify: `CHANGELOG.md` (new `[0.3.0]` entry)
- Modify: `src/routes/(app)/about/assistant/+page.svelte` (or `workflows`) — a short "Keep skills on" paragraph
- Regenerate: `docs/About-Donna-v0.3.0.pdf` (replace the v0.2.0 export)

- [ ] **Step 1:** Add a sentence to the README Assistant bullet: "a per-chat **Keep skills on** switch carries the skills you've applied across follow-up turns (off by default; each turn still records exactly which skills it used)."
- [ ] **Step 2:** Add the same capability to `docs/PRODUCT.md` and a short plain-language paragraph to `docs/GUIDE.md`.
- [ ] **Step 3:** Add a `## [0.3.0] — 2026-06-23 — Sticky skills` entry to `CHANGELOG.md` describing the toggle + the design posture (off by default, per-chat, audit-honest).
- [ ] **Step 4:** Add a short "Keep skills on" explanation to the in-app `/about/assistant` page (the surface that hosts the composer guide).
- [ ] **Step 5:** Regenerate the About PDF for 0.3.0 (reuse the headless-Chromium method from the v0.2.0 export: log in to the running stack, print the 11 `/about` rail pages with chrome hidden + the prose-fill CSS, `pdfunite` → `docs/About-Donna-v0.3.0.pdf`); remove `docs/About-Donna-v0.2.0.pdf`; repoint the README "About Donna — v0.x.0 (PDF)" link.
- [ ] **Step 6:** `npx prettier --check` the changed docs; commit.

```bash
git add README.md docs/PRODUCT.md docs/GUIDE.md CHANGELOG.md "src/routes/(app)/about" docs/About-Donna-v0.3.0.pdf
git rm docs/About-Donna-v0.2.0.pdf
git commit -m "docs: document the Keep skills on toggle; refresh About PDF for 0.3.0"
git push
```

---

### Task 12: Version bump to 0.3.0

**Files:**
- Modify: `package.json` (`version` → `0.3.0`)
- Modify: `README.md` (top badge `**v0.3.0**`)
- Modify: `desktop/package.json` (`version` → `0.3.0`)
- Modify: `README.md` (Option-A DMG link → `Donna-0.3.0-arm64.dmg` / `desktop-v0.3.0`)
- Modify: install-doc image-tag examples → `v0.3.0`

- [ ] **Step 1:** Bump `package.json` and the README badge to `0.3.0`.
- [ ] **Step 2:** Bump `desktop/package.json` to `0.3.0` (artifact becomes `Donna-0.3.0-arm64.dmg`), and **bump the launcher's pinned image tag**: set `imageTag: 'v0.3.0'` in `desktop/src/main/index.ts`.
- [ ] **Step 3:** Update the README install snippet's `DONNA_IMAGE_TAG=v0.3.0` and the Option-A DMG filename/tag.
- [ ] **Step 4:** Desktop gates: `cd desktop && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5:** Commit.

```bash
git add package.json README.md desktop/package.json desktop/src/main/index.ts
git commit -m "chore(release): 0.3.0 — sticky skills"
git push
```

---

### Task 13: Merge, cut images, dry-run

- [ ] **Step 1:** Open the PR (`feat/sticky-skills` → `main`), ensure gates + review are green, **merge with a MERGE COMMIT**, mirror `main` to the `tucuxi` remote.
- [ ] **Step 2:** Tag + trigger the image build:

```bash
gh release create v0.3.0 -R LegalQuants/Donna --title v0.3.0 --generate-notes   # pushes the tag → release.yml
gh run watch <run-id> -R LegalQuants/Donna --exit-status
gh run view <run-id> -R LegalQuants/Donna --json conclusion    # trust this, not watch (gotcha #6)
```
Expected: 5 `ghcr.io/legalquants/donna-*:v0.3.0` images published. Verify all 5 manifests present + anonymously pullable (the packages were made public for 0.2.0; same packages).

- [ ] **Step 3:** Release-image dry-run: isolated `-p donna-rel-dryrun` + shifted ports + `DONNA_IMAGE_TAG=v0.3.0`, pull → 8/8 healthy → admin fixture → Playwright login PASS → tear down `down -v`. (Mirror the 0.2.0 dry-run.)

---

### Task 14: Cut the macOS DMG (`desktop-v0.3.0`)

- [ ] **Step 1:** Tag (version already 0.3.0 from Task 12, so the artifact name will be `Donna-0.3.0-arm64.dmg`):

```bash
git tag -a desktop-v0.3.0 -m "Donna for Mac 0.3.0 — sticky skills" <main-tip>
git push origin desktop-v0.3.0 && git push tucuxi desktop-v0.3.0   # triggers desktop-release.yml
```
- [ ] **Step 2:** Watch + verify the **published artifact** (gotcha #6): `gh run view --json conclusion`, then `gh release download desktop-v0.3.0 -p '*.dmg' -D /tmp`, `spctl -a -vvv -t open --context context:primary-signature` (want Notarized Developer ID / Tucuxi `MC8BT9Z8GD`), `xcrun stapler validate`.
- [ ] **Step 3:** Fresh-Mac install test from a true clean slate (remove `donna-desktop` containers+volumes, the `ghcr.io/legalquants/donna-*` images, the app-data dir + prefs plist) → download DMG → wizard → 8/8 healthy → browser login → open a chat, apply a skill, flip **Keep skills on**, confirm a follow-up keeps it. Record the result.

---

## Self-Review

- **Spec coverage:** §3 contract → Task 1; §4.1 load → Task 3 (+ §parser Task 2); §4.2 controller → Task 4; §4.3 composer → Task 7; §4.4 send → Task 5; §4.5 BFF → Task 6; §5 data flow → exercised by Task 9; §6 edge cases → Task 4 tests (sync no-op / id-change) + Task 5 (retry omits) + Task 3 (degradation); §7 tests → Tasks 2/3/4/6/9; release scope (docs/version/images/DMG) → Tasks 11–14. No gaps.
- **Placeholder scan:** none — every code step shows the code; the e2e (Task 9) gives the flow + a concrete non-determinism fallback rather than a vague "write tests".
- **Type consistency:** `createStickySkills` surface (`enabled`/`set`/`dirty`/`syncFromChat`/`toggle`/`sendValue`/`markSent`) is identical across Tasks 4/7/8; `send(..., setSticky?): Promise<boolean>` is consistent across Tasks 5/8; `parseChat(raw): { stickySkills: string[] }` consistent across Tasks 2/3; `set_sticky` boolean is consistent across Tasks 5/6.
