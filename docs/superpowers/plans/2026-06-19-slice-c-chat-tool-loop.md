# Slice C — governed chat tool-loop (confirm gate + connect-on-demand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render lq-ai's two terminal chat-tool-loop SSE events — the destructive-tool confirmation gate (approve/deny → resume) and connect-on-demand (inline Connect) — in Donna's chat.

**Architecture:** Extend the chat SSE parser with two frame types; the chat store stashes their payloads on the streaming message, ends the turn, and (for the gate) exposes `decide(idx, decision)` that POSTs the resume endpoint and streams the resumed turn into the same message via a shared `consumeStream`. A BFF proxy pipes the resume SSE. `Message.svelte` renders an approve/deny card and a connect card; the connect card reuses the Slice B2 OAuth route (generalized with a `?return=` path back to the chat), and the chat page shows a "Connected — Retry" banner on return.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright. Backend lq-ai pin `97ccbc0` (PR5a #181 + PR5b #187).

## Global Constraints

- **Svelte 5 runes** throughout (`$props`, `$state`, `$derived`). Tabs for indentation (prettier-enforced).
- **Server-only imports** (`$lib/server/lqClient`) never reach client code; data crosses via `load` / form actions / `+server.ts` only.
- **Honest degradation:** a malformed SSE frame is dropped (existing `parseDataPayload` convention); a failed resume surfaces a friendly per-message error; the turn never crashes.
- **Gates (every task):** `npm run check` 0 errors / 0 warnings · `npm run lint` fully green · `npx vitest run` passing. (`npm run check` prints a harmless `ERR_MODULE_NOT_FOUND` vendor/lq-ai line but still reports `0 ERRORS`.)
- **Backend contract (pin `97ccbc0`):** terminal SSE frames `tool_confirmation_required` `{ type, lq_ai_message_id, pending_call_id, provider, tool, function_name, args_summary, tier, destructive }` and `mcp_authorization_required` `{ type, lq_ai_message_id, server, authorize_url }`. Resume: `POST /api/v1/chats/{chat_id}/tool-calls/{pending_call_id}` body `{ decision: "approve" | "deny" }` → SSE (same shape) or 404/409/400. The backend does NOT auto-resume after `mcp_authorization_required` — the user re-sends after connecting.

---

### Task 1: SSE layer — two new frame types

**Files:**

- Modify: `src/lib/chat/sse.ts`
- Test: `src/lib/chat/sse.test.ts` (extend)

**Interfaces:**

- Produces: `StreamFrame` union gains `{ type:'tool_confirmation_required'; lq_ai_message_id; pending_call_id; provider; tool; function_name; args_summary: Record<string, unknown>; tier; destructive }` and `{ type:'mcp_authorization_required'; lq_ai_message_id; server; authorize_url }`. `parseDataPayload` returns them for valid frames, `null` for malformed.

- [ ] **Step 1: Write the failing test** (append to `src/lib/chat/sse.test.ts`)

```ts
import { parseDataPayload } from './sse';

describe('tool-loop terminal frames', () => {
	it('parses tool_confirmation_required', () => {
		const f = parseDataPayload(
			JSON.stringify({
				type: 'tool_confirmation_required',
				lq_ai_message_id: 'a1',
				pending_call_id: 'p1',
				provider: 'deepwiki',
				tool: 'read_wiki_structure',
				function_name: 'mcp__deepwiki__read_wiki_structure',
				args_summary: { repoName: 'facebook/react' },
				tier: 2,
				destructive: false
			})
		);
		expect(f).toMatchObject({
			type: 'tool_confirmation_required',
			pending_call_id: 'p1',
			tool: 'read_wiki_structure',
			tier: 2,
			destructive: false
		});
	});
	it('drops a tool_confirmation_required missing pending_call_id', () => {
		const f = parseDataPayload(
			JSON.stringify({ type: 'tool_confirmation_required', lq_ai_message_id: 'a1' })
		);
		expect(f).toBeNull();
	});
	it('parses mcp_authorization_required', () => {
		const f = parseDataPayload(
			JSON.stringify({
				type: 'mcp_authorization_required',
				lq_ai_message_id: 'a1',
				server: 'context7',
				authorize_url: '/api/v1/mcp/oauth/context7/authorize'
			})
		);
		expect(f).toMatchObject({ type: 'mcp_authorization_required', server: 'context7' });
	});
	it('drops an mcp_authorization_required missing server', () => {
		expect(
			parseDataPayload(
				JSON.stringify({ type: 'mcp_authorization_required', lq_ai_message_id: 'a1' })
			)
		).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/sse.test.ts`
Expected: FAIL — the new frames return `null` (no branch yet), so `toMatchObject` fails on `null`.

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/chat/sse.ts`)

Add two members to the `StreamFrame` union (after the `complete` member, before `error`):

```ts
	| {
			type: 'tool_confirmation_required';
			lq_ai_message_id: string;
			pending_call_id: string;
			provider: string;
			tool: string;
			function_name: string;
			args_summary: Record<string, unknown>;
			tier: number;
			destructive: boolean;
	  }
	| {
			type: 'mcp_authorization_required';
			lq_ai_message_id: string;
			server: string;
			authorize_url: string;
	  }
```

In `parseDataPayload`, add two branches (after the `complete` branch, before the `error` branch):

```ts
if (o.type === 'tool_confirmation_required') {
	return typeof o.lq_ai_message_id === 'string' && typeof o.pending_call_id === 'string'
		? (o as unknown as StreamFrame)
		: null;
}
if (o.type === 'mcp_authorization_required') {
	return typeof o.lq_ai_message_id === 'string' && typeof o.server === 'string'
		? (o as unknown as StreamFrame)
		: null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/sse.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/sse.ts src/lib/chat/sse.test.ts
git commit -m "feat(chat): parse tool_confirmation_required + mcp_authorization_required SSE frames"
```

---

### Task 2: Chat store — gate fields/statuses + `consumeStream` refactor

**Files:**

- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts` (extend)

**Interfaces:**

- Consumes: `StreamFrame` (Task 1).
- Produces: `ChatMessage.status` gains `'awaiting_confirmation' | 'awaiting_auth'`; new optional fields `confirmation?: { pending_call_id: string; provider: string; tool: string; function_name: string; args_summary: Record<string, unknown>; tier: number; destructive: boolean }` and `mcpAuth?: { server: string; authorize_url: string }`. A private `consumeStream(idx, res)` shared by `runStream` (and `decide` in Task 3).

- [ ] **Step 1: Write the failing test** (append to `src/lib/chat/chatStream.svelte.test.ts`)

```ts
describe('tool-loop gate frames', () => {
	it('pauses on tool_confirmation_required with the gate payload', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					streamResponse([
						'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
						'data: {"type":"tool_confirmation_required","lq_ai_message_id":"a1","pending_call_id":"p1","provider":"deepwiki","tool":"read_wiki_structure","function_name":"mcp__deepwiki__read_wiki_structure","args_summary":{"repoName":"facebook/react"},"tier":2,"destructive":false}\n\n',
						'data: [DONE]\n\n'
					])
				)
		);
		const chat = createChatStream('c1');
		await chat.send('use deepwiki');
		const m = chat.messages[1];
		expect(m.status).toBe('awaiting_confirmation');
		expect(m.confirmation).toMatchObject({ pending_call_id: 'p1', tool: 'read_wiki_structure' });
		expect(chat.status).toBe('idle');
	});

	it('pauses on mcp_authorization_required with the server payload', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					streamResponse([
						'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
						'data: {"type":"mcp_authorization_required","lq_ai_message_id":"a1","server":"context7","authorize_url":"/api/v1/mcp/oauth/context7/authorize"}\n\n',
						'data: [DONE]\n\n'
					])
				)
		);
		const chat = createChatStream('c1');
		await chat.send('use context7');
		const m = chat.messages[1];
		expect(m.status).toBe('awaiting_auth');
		expect(m.mcpAuth).toMatchObject({ server: 'context7' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — `applyFrame` has no branch for the new frames, so `m.status` stays `'done'` and `m.confirmation` is `undefined`.

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/chat/chatStream.svelte.ts`)

Extend the `ChatMessage` interface:

```ts
	status?: 'streaming' | 'done' | 'error' | 'awaiting_confirmation' | 'awaiting_auth';
```

Add two fields to `ChatMessage` (after `applied_file_ids`):

```ts
	/** Destructive/requires_confirmation tool-call gate payload (status 'awaiting_confirmation'). */
	confirmation?: {
		pending_call_id: string;
		provider: string;
		tool: string;
		function_name: string;
		args_summary: Record<string, unknown>;
		tier: number;
		destructive: boolean;
	};
	/** OAuth MCP server the user must connect (status 'awaiting_auth'). */
	mcpAuth?: { server: string; authorize_url: string };
```

In `applyFrame`, add two branches before the `error` branch:

```ts
		} else if (frame.type === 'tool_confirmation_required') {
			m.confirmation = {
				pending_call_id: frame.pending_call_id,
				provider: frame.provider,
				tool: frame.tool,
				function_name: frame.function_name,
				args_summary: frame.args_summary,
				tier: frame.tier,
				destructive: frame.destructive
			};
			m.status = 'awaiting_confirmation';
		} else if (frame.type === 'mcp_authorization_required') {
			m.mcpAuth = { server: frame.server, authorize_url: frame.authorize_url };
			m.status = 'awaiting_auth';
```

Extract the read loop from `runStream` into a private `consumeStream`. Replace `runStream`'s body from `const reader = res.body.getReader();` (line ~157) through the `await loadAnonymization(idx);` (line ~192) with a single call `await consumeStream(idx, res);`, and add this function above `runStream`:

```ts
// Read an SSE Response into the assistant message at `idx`. Shared by the
// initial send/retry and the confirmation resume. A gate frame
// (tool_confirmation_required / mcp_authorization_required) ends the read and
// leaves a non-'done' status, so citations/anonymization are not fetched.
async function consumeStream(idx: number, res: Response) {
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	const parser = createSseParser();
	let ended = false;
	try {
		while (!ended) {
			const { value, done } = await reader.read();
			if (done) break;
			for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
				if (frame.type === 'done') {
					ended = true;
					break;
				}
				applyFrame(idx, frame);
				if (
					frame.type === 'error' ||
					frame.type === 'tool_confirmation_required' ||
					frame.type === 'mcp_authorization_required'
				) {
					ended = true;
					break;
				}
			}
		}
		if (!ended) {
			for (const frame of parser.push(decoder.decode())) {
				if (frame.type === 'done') break;
				applyFrame(idx, frame);
				if (frame.type === 'error') break;
			}
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	if (messages[idx].status === 'streaming') messages[idx].status = 'done';
	if (status === 'streaming') status = 'idle';
	if (messages[idx].status === 'done') {
		await loadCitations(idx);
		await loadAnonymization(idx);
	}
}
```

After the refactor, `runStream`'s `try` block reads (replacing the old reader/loop section):

```ts
				setError(idx, msg);
					return;
				}
				await consumeStream(idx, res);
			} catch (e) {
```

(i.e. the `if (!res.ok || !res.body) { … return; }` block is unchanged; the line right after it becomes `await consumeStream(idx, res);` and the old reader/loop/flush/status/loadCitations/loadAnonymization lines are deleted.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS — the new 2 gate tests AND all pre-existing tests (the refactor preserves send/delta/complete/error behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(chat): store handling for tool-loop gate frames + consumeStream refactor"
```

---

### Task 3: Chat store — `decide()` resume

**Files:**

- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts` (extend)

**Interfaces:**

- Consumes: `consumeStream`, `ChatMessage.confirmation` (Task 2).
- Produces: `decide(idx: number, decision: 'approve' | 'deny'): Promise<void>` on the returned store object.

- [ ] **Step 1: Write the failing test** (append to `src/lib/chat/chatStream.svelte.test.ts`)

```ts
describe('decide() resumes a gated turn', () => {
	function gateThenResume(resumeFrames: string[]) {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				streamResponse([
					'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
					'data: {"type":"tool_confirmation_required","lq_ai_message_id":"a1","pending_call_id":"p1","provider":"deepwiki","tool":"read_wiki_structure","function_name":"f","args_summary":{},"tier":2,"destructive":false}\n\n',
					'data: [DONE]\n\n'
				])
			)
			.mockResolvedValueOnce(streamResponse(resumeFrames));
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('approve POSTs the decision and streams the resumed turn into the same message', async () => {
		const fetchMock = gateThenResume([
			'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
			'data: {"type":"delta","delta":"Done","lq_ai_message_id":"a1"}\n\n',
			'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Done"}}\n\n',
			'data: [DONE]\n\n'
		]);
		const chat = createChatStream('c1');
		await chat.send('use deepwiki');
		expect(chat.messages[1].status).toBe('awaiting_confirmation');
		await chat.decide(1, 'approve');
		expect(chat.messages[1].status).toBe('done');
		expect(chat.messages[1].content).toBe('Done');
		expect(chat.messages[1].confirmation).toBeUndefined();
		const resumeCall = fetchMock.mock.calls[1];
		expect(resumeCall[0]).toBe('/chats/c1/tool-calls/p1');
		expect(JSON.parse((resumeCall[1] as { body: string }).body)).toEqual({ decision: 'approve' });
	});

	it('surfaces a friendly error when the resume is 409 (expired)', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				streamResponse([
					'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
					'data: {"type":"tool_confirmation_required","lq_ai_message_id":"a1","pending_call_id":"p1","provider":"d","tool":"t","function_name":"f","args_summary":{},"tier":2,"destructive":false}\n\n',
					'data: [DONE]\n\n'
				])
			)
			.mockResolvedValueOnce(new Response('', { status: 409 }));
		vi.stubGlobal('fetch', fetchMock);
		const chat = createChatStream('c1');
		await chat.send('use deepwiki');
		await chat.decide(1, 'approve');
		expect(chat.messages[1].status).toBe('error');
		expect(chat.messages[1].error).toMatch(/expired/i);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — `chat.decide is not a function`.

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/chat/chatStream.svelte.ts`)

Add this function after `retry()`:

```ts
// Resume a turn paused at a confirmation gate: POST the decision and stream the
// resumed turn into the SAME assistant message (idx).
async function decide(idx: number, decision: 'approve' | 'deny') {
	if (status === 'streaming') return;
	const m = messages[idx];
	const pendingId = m.confirmation?.pending_call_id;
	if (!pendingId) return;
	m.confirmation = undefined;
	m.error = undefined;
	m.status = 'streaming';
	status = 'streaming';
	controller = new AbortController();
	try {
		const res = await fetch(`/chats/${chatId}/tool-calls/${pendingId}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ decision }),
			signal: controller.signal
		});
		if (!res.ok || !res.body) {
			setError(
				idx,
				res.status === 404 || res.status === 409
					? 'This confirmation expired — please re-send your message.'
					: 'Could not resume the turn. Please try again.'
			);
			return;
		}
		await consumeStream(idx, res);
	} catch (e) {
		if ((e as Error).name === 'AbortError') {
			messages[idx].status = 'done';
			status = 'idle';
		} else {
			setError(idx, 'The connection was lost. Please try again.');
		}
	} finally {
		controller = null;
	}
}
```

Add `decide` to the returned object (after `retry,`):

```ts
(retry, decide, stop);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS (the 2 new decide tests + all prior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(chat): decide() resumes a gated turn via the tool-calls endpoint"
```

---

### Task 4: BFF resume proxy route

**Files:**

- Create: `src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/+server.ts`
- Test: `src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/server.test.ts`

**Interfaces:**

- Consumes: `lqStream` from `$lib/server/lqClient`.
- Produces: `POST` that forwards `{ decision }` to `/api/v1/chats/{id}/tool-calls/{pending_call_id}` and pipes the SSE back.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		params: { id: 'c1', pending_call_id: 'p1' },
		request: new Request('http://x/chats/c1/tool-calls/p1', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}) as never;

beforeEach(() => lqStream.mockReset());

describe('POST tool-calls resume', () => {
	it('forwards the decision to the backend resume endpoint', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		const out = await POST(event({ decision: 'approve' }));
		const call = lqStream.mock.calls[0];
		expect(call[1]).toBe('/api/v1/chats/c1/tool-calls/p1');
		expect((call[2] as { method: string }).method).toBe('POST');
		expect(JSON.parse((call[2] as { body: string }).body)).toEqual({ decision: 'approve' });
		expect(out.status).toBe(200);
	});

	it('coerces an invalid decision to deny (fail-safe)', async () => {
		lqStream.mockResolvedValue(new Response('', { status: 200 }));
		await POST(event({ decision: 'whatever' }));
		expect(JSON.parse((lqStream.mock.calls[0][2] as { body: string }).body)).toEqual({
			decision: 'deny'
		});
	});

	it('passes a non-2xx status through', async () => {
		lqStream.mockResolvedValue(new Response('', { status: 409 }));
		const out = await POST(event({ decision: 'approve' }));
		expect(out.status).toBe(409);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/server.test.ts"`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/+server.ts
import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
	let decision: 'approve' | 'deny' = 'deny';
	try {
		const body = (await event.request.json()) as { decision?: unknown };
		if (body.decision === 'approve') decision = 'approve';
	} catch {
		decision = 'deny';
	}

	const upstream = await lqStream(
		event,
		`/api/v1/chats/${event.params.id}/tool-calls/${event.params.pending_call_id}`,
		{ method: 'POST', body: JSON.stringify({ decision }) }
	);

	// Pipe the resumed SSE straight back; forward a non-2xx status so the client's
	// res.ok check surfaces 404 (expired/non-owner) / 409 (already resolved).
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
			'cache-control': 'no-cache'
		}
	});
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/+server.ts" "src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/server.test.ts"
git commit -m "feat(chat): BFF proxy for the tool-call resume SSE"
```

---

### Task 5: Message.svelte — confirmation + connect cards

**Files:**

- Modify: `src/lib/components/Message.svelte`
- Test: `src/lib/components/Message.svelte.test.ts` (extend)

**Interfaces:**

- Consumes: `ChatMessage.confirmation`, `ChatMessage.mcpAuth`, the new statuses (Task 2).
- Produces: `Message` gains props `chatId?: string` and `ondecide?: (decision: 'approve' | 'deny') => void`; renders an approve/deny card for `awaiting_confirmation` and a Connect card for `awaiting_auth`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/components/Message.svelte.test.ts`)

```ts
describe('Message tool-loop cards', () => {
	it('renders the confirmation card and fires ondecide', async () => {
		let decided: string | null = null;
		const { getByRole, getByText } = render(Message, {
			props: {
				message: {
					key: 'g1',
					id: 'g1',
					role: 'assistant',
					content: '',
					status: 'awaiting_confirmation',
					confirmation: {
						pending_call_id: 'p1',
						provider: 'deepwiki',
						tool: 'read_wiki_structure',
						function_name: 'mcp__deepwiki__read_wiki_structure',
						args_summary: { repoName: 'facebook/react' },
						tier: 2,
						destructive: true
					}
				} as never,
				ondecide: (d: 'approve' | 'deny') => (decided = d)
			}
		});
		expect(getByText(/read_wiki_structure/)).toBeInTheDocument();
		expect(getByText(/facebook\/react/)).toBeInTheDocument();
		expect(getByText(/destructive/i)).toBeInTheDocument();
		getByRole('button', { name: /approve/i }).click();
		expect(decided).toBe('approve');
	});

	it('renders the connect card linking to the BFF connect route with a chat return', () => {
		const { getByRole } = render(Message, {
			props: {
				message: {
					key: 'g2',
					id: 'g2',
					role: 'assistant',
					content: '',
					status: 'awaiting_auth',
					mcpAuth: { server: 'context7', authorize_url: '/api/v1/mcp/oauth/context7/authorize' }
				} as never,
				chatId: 'c1'
			}
		});
		const link = getByRole('link', { name: /connect/i });
		expect(link).toHaveAttribute(
			'href',
			'/settings/connections/context7/connect?return=' + encodeURIComponent('/chats/c1')
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: FAIL — no card renders; `getByText(/read_wiki_structure/)` throws.

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/components/Message.svelte`)

Add the two props to the `$props()` destructure + type:

```ts
let {
	message,
	onretry,
	ondecide,
	onactivatecitation,
	chatId
}: {
	message: ChatMessage;
	onretry?: () => void;
	ondecide?: (decision: 'approve' | 'deny') => void;
	onactivatecitation?: (c: Citation) => void;
	chatId?: string;
} = $props();
```

In the assistant branch, add two `{:else if}` arms to the status chain. The chain currently is `{#if message.status === 'error'} … {:else} … {/if}`. Insert the two new arms between them:

```svelte
	{#if message.status === 'error'}
		<p class="text-mlq-error">
			⚠ {message.error}
			<button
				type="button"
				onclick={() => onretry?.()}
				class="ml-2 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
				>Retry</button
			>
		</p>
	{:else if message.status === 'awaiting_confirmation' && message.confirmation}
		{@const c = message.confirmation}
		<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-3 text-xs">
			<p class="text-mlq-text">
				The assistant wants to run <span class="font-medium">{c.tool}</span> on
				<span class="font-medium">{c.provider}</span>.
			</p>
			{#if c.destructive}
				<p class="mt-1 font-medium text-mlq-error">This tool is destructive.</p>
			{/if}
			{#if Object.keys(c.args_summary).length}
				<dl class="mt-2 space-y-0.5 text-mlq-muted">
					{#each Object.entries(c.args_summary) as [k, v] (k)}
						<div class="flex gap-2">
							<dt class="font-medium">{k}</dt>
							<dd class="min-w-0 break-words">{String(v)}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			<div class="mt-3 flex items-center gap-2">
				<button
					type="button"
					onclick={() => ondecide?.('approve')}
					class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 font-medium text-white hover:opacity-90"
					>Approve</button
				>
				<button
					type="button"
					onclick={() => ondecide?.('deny')}
					class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-mlq-text hover:bg-mlq-surface-alt"
					>Deny</button
				>
				<span class="ml-1 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
					>Tier {c.tier}</span
				>
			</div>
		</div>
	{:else if message.status === 'awaiting_auth' && message.mcpAuth}
		{@const a = message.mcpAuth}
		<div class="rounded-mlq-control border border-mlq-subtle p-3 text-xs">
			<p class="text-mlq-text">
				Connect <span class="font-medium">{a.server}</span> to use this tool.
			</p>
			<a
				href="/settings/connections/{a.server}/connect?return={encodeURIComponent(
					`/chats/${chatId}`
				)}"
				data-sveltekit-reload
				class="mt-2 inline-block rounded-mlq-control bg-mlq-workflow px-3 py-1.5 font-medium text-white hover:opacity-90"
				>Connect</a
			>
		</div>
	{:else}
```

(The existing `{:else}` content block and its closing `{/if}` are unchanged — you are inserting the two `{:else if}` arms before the final `{:else}`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(chat): confirmation + connect cards in the assistant message"
```

---

### Task 6: Connect route — `?return=` generalization

**Files:**

- Modify: `src/routes/(app)/settings/connections/[server]/connect/+server.ts`
- Test: `src/routes/(app)/settings/connections/[server]/connect/server.test.ts` (extend)

**Interfaces:**

- Produces: the connect `GET` honors an optional same-origin `?return=<path>` (must start with `/`), defaulting to `/settings/connections`; the `return_url` sent to the backend is `${origin}${returnPath}`.

- [ ] **Step 1: Write the failing test** (append to the existing connect `server.test.ts`)

```ts
describe('return param', () => {
	it('uses a same-origin return path in the authorize return_url', async () => {
		lqFetch.mockResolvedValue(
			new Response(null, { status: 302, headers: { location: 'https://as.example/a' } })
		);
		const { GET } = await import('./+server');
		await expect(
			GET({
				params: { server: 'ctx7' },
				url: new URL('http://localhost/settings/connections/ctx7/connect?return=/chats/c1')
			} as never)
		).rejects.toMatchObject({ status: 302 });
		const calledPath = lqFetch.mock.calls[0][1] as string;
		expect(calledPath).toContain('return_url=' + encodeURIComponent('http://localhost/chats/c1'));
	});

	it('falls back to /settings/connections for a non-/ or cross-origin return', async () => {
		lqFetch.mockResolvedValue(
			new Response(null, { status: 302, headers: { location: 'https://as.example/a' } })
		);
		const { GET } = await import('./+server');
		await expect(
			GET({
				params: { server: 'ctx7' },
				url: new URL(
					'http://localhost/settings/connections/ctx7/connect?return=https://evil.example'
				)
			} as never)
		).rejects.toMatchObject({ status: 302 });
		const calledPath = lqFetch.mock.calls[0][1] as string;
		expect(calledPath).toContain(
			'return_url=' + encodeURIComponent('http://localhost/settings/connections')
		);
	});
});
```

(The existing connect test file mocks `lqFetch` and imports `./+server` per test — match that harness; if the file uses a top-level `const lqFetch = vi.fn()` + `vi.mock`, reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"`
Expected: FAIL — the handler ignores `return`, so `return_url` is always `…/settings/connections` (the first new test fails).

- [ ] **Step 3: Write minimal implementation** (edit `connect/+server.ts`)

Replace the `returnUrl` construction:

```ts
const server = event.params.server;
// Optional same-origin return path (default the connections page). Reject any
// non-relative / cross-origin value to prevent an open redirect.
const requested = event.url.searchParams.get('return');
const returnPath = requested && requested.startsWith('/') ? requested : CONNECTIONS;
const returnUrl = `${event.url.origin}${returnPath}`;
```

(Everything else in the file is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/connections/[server]/connect/+server.ts" "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"
git commit -m "feat(connections): connect route honors a same-origin ?return= path"
```

---

### Task 7: Chat page wiring — ondecide + connected banner

**Files:**

- Create: `src/lib/chat/ConnectedBanner.svelte`
- Test: `src/lib/chat/ConnectedBanner.svelte.test.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

**Interfaces:**

- Consumes: `chat.decide` (Task 3); `Message` `ondecide`/`chatId` props (Task 5).
- Produces: a `ConnectedBanner` (`{ server?: string | null; error?: string | null; onretry: () => void }`) shown when the chat URL carries `?mcp_connected` / `?mcp_error`; the page wires `ondecide` and the banner's Retry.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/ConnectedBanner.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConnectedBanner from './ConnectedBanner.svelte';

describe('ConnectedBanner', () => {
	it('shows a connected banner with a Retry that fires onretry', () => {
		let retried = false;
		render(ConnectedBanner, { props: { server: 'context7', onretry: () => (retried = true) } });
		expect(screen.getByText(/connected to/i)).toHaveTextContent(/context7/);
		screen.getByRole('button', { name: /retry|re-send/i }).click();
		expect(retried).toBe(true);
	});
	it('shows an error banner when error is set', () => {
		render(ConnectedBanner, { props: { error: 'context7', onretry: () => {} } });
		expect(screen.getByRole('alert')).toHaveTextContent(/couldn|could not/i);
	});
	it('renders nothing when neither server nor error is set', () => {
		const { container } = render(ConnectedBanner, { props: { onretry: () => {} } });
		expect(container.textContent?.trim()).toBe('');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/ConnectedBanner.svelte.test.ts`
Expected: FAIL — cannot resolve `./ConnectedBanner.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/lib/chat/ConnectedBanner.svelte -->
<script lang="ts">
	let {
		server = null,
		error = null,
		onretry
	}: { server?: string | null; error?: string | null; onretry: () => void } = $props();
</script>

{#if error}
	<div
		role="alert"
		class="mx-auto mb-3 max-w-2xl rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 px-3 py-2 text-xs text-mlq-text"
	>
		Couldn’t connect to <span class="font-medium">{error}</span>. Please try again.
	</div>
{:else if server}
	<div
		role="status"
		class="mx-auto mb-3 flex max-w-2xl items-center justify-between gap-3 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 px-3 py-2 text-xs text-mlq-text"
	>
		<span>Connected to <span class="font-medium">{server}</span> — re-send your message?</span>
		<button
			type="button"
			onclick={onretry}
			class="rounded-mlq-control bg-mlq-workflow px-3 py-1 font-medium text-white hover:opacity-90"
			>Retry</button
		>
	</div>
{/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/ConnectedBanner.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the chat page** (edit `src/routes/(app)/chats/[id]/+page.svelte`)

Add imports + the page-state read in `<script>`:

```ts
import { page } from '$app/state';
import ConnectedBanner from '$lib/chat/ConnectedBanner.svelte';
```

Add derived banner state + a resend handler (after the `submit`/`retry` functions):

```ts
let bannerDismissed = $state(false);
const connectedServer = $derived(
	bannerDismissed ? null : page.url.searchParams.get('mcp_connected')
);
const connectError = $derived(bannerDismissed ? null : page.url.searchParams.get('mcp_error'));
function resendLastUser() {
	bannerDismissed = true;
	const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
	if (lastUser) chat.send(lastUser.content, modelStore.selectedModel);
}
```

Render the banner above the message list (inside the scroller's inner `div`, before the `{#each}`):

```svelte
<ConnectedBanner server={connectedServer} error={connectError} onretry={resendLastUser} />
{#each chat.messages as m, i (m.key)}
	<Message
		message={m}
		chatId={data.chatId}
		onretry={retry}
		ondecide={(d) => chat.decide(i, d)}
		onactivatecitation={(c) => docPanel.open(c)}
	/>
{/each}
```

(The `{#each}` gains the index `i` and the `chatId` + `ondecide` props; everything else on the page is unchanged.)

- [ ] **Step 6: Run the gates** (the page itself has no unit test; verify it compiles + the suite is green)

Run: `npm run check` → expect `0 ERRORS / 0 WARNINGS`. Then `npx vitest run src/lib/chat src/lib/components/Message.svelte.test.ts` → expect PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/ConnectedBanner.svelte src/lib/chat/ConnectedBanner.svelte.test.ts "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(chat): wire confirm-gate decide + connect-on-demand return banner into the chat page"
```

---

### Task 8: Live e2e + dev verification

**Files:**

- Create: `tests/chat-tool-loop.spec.ts`

**Interfaces:**

- Consumes: the running stack with DeepWiki MCP tools enabled (confirm gate) and Context7 (connect-on-demand).

- [ ] **Step 1: Write the e2e**

```ts
// tests/chat-tool-loop.spec.ts
import { test, expect, type Page } from '@playwright/test';

// Live e2e for the governed chat tool-loop (Slice C). Gated on MCP tools being
// configured + enabled; self-skips otherwise. The model deciding to call a tool
// is non-deterministic — the test instructs it explicitly and skips honestly if
// the assistant answers without calling a tool.
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('a tool call surfaces the confirmation gate; Approve resumes the turn', async ({ page }) => {
	await login(page);
	await page.goto('/');
	// Start a chat from the landing composer.
	const composer = page.getByRole('textbox').first();
	await composer.fill(
		'Use the deepwiki read_wiki_structure tool on facebook/react. Call the tool — do not answer from memory.'
	);
	await composer.press('Enter');
	await page.waitForURL(/\/chats\//, { timeout: 20000 });

	// Either the confirmation card appears (tool was called) or the assistant
	// answered without a tool — both are honest outcomes; only the first is the
	// flow under test.
	const approve = page.getByRole('button', { name: /approve/i });
	const appeared = await approve.isVisible({ timeout: 30000 }).catch(() => false);
	if (!appeared) {
		test.skip(true, 'Assistant did not call a tool this run — gate not exercised');
		return;
	}
	await expect(page.getByText(/wants to run/i)).toBeVisible();
	await approve.click();
	// The resumed turn streams an answer into the same message (card is gone).
	await expect(approve).toBeHidden({ timeout: 30000 });
});
```

- [ ] **Step 2: Prepare the stack**

Ensure DeepWiki's tools are enabled (admin `/settings/mcp` → the `deepwiki` card → **Refresh** → toggles show Enabled; they were enabled in Slice B). Rebuild `donna-web` so it serves the new code:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/chat-tool-loop.spec.ts`
Expected: PASS (gate appears → Approve → resumes), or an honest skip if the model didn't call the tool. Re-run once if skipped (the explicit instruction usually triggers a call). Capture a screenshot of the confirmation card for the handoff.

- [ ] **Step 4: Manually verify connect-on-demand**

In a chat, ask the assistant to use a Context7 tool ("Use the context7 resolve-library-id tool for 'react'. Call the tool."). Confirm the **Connect context7** card renders; click it → it routes through the OAuth flow (stops at the AS per the Slice B2 honest limit) and returns to `/chats/{id}?mcp_connected=context7` → the "Connected — Retry" banner appears. Record the result in the handoff.

- [ ] **Step 5: Commit**

```bash
git add tests/chat-tool-loop.spec.ts
git commit -m "test(chat): live e2e for the tool-loop confirmation gate"
```

---

## After all tasks

- Full gates: `npm run check` (0/0), `npm run lint` (green), `npx vitest run` (all pass). Rebuild `donna-web` before any manual/e2e check.
- Whole-branch Opus review, then PR with a **merge commit**; mirror `main` + branch to `tucuxi`.
- Update the handoff + milestone memory: Slice C shipped (confirm gate + connect-on-demand); provenance/citations remain Slice D (PR6).

## Self-review notes (coverage)

- Spec §SSE layer → Task 1; §store (statuses/fields/consumeStream) → Task 2; §decide resume → Task 3; §BFF resume route → Task 4; §Message cards → Task 5; §connect route `?return=` → Task 6; §connect-return banner + page wiring → Task 7; §testing live e2e → Task 8. Out-of-scope (provenance/citations) intentionally absent. No section unmapped.
- Type consistency: `ChatMessage.confirmation`/`mcpAuth` shapes are identical across Tasks 2 (definition), 3 (`decide` reads `confirmation.pending_call_id`), and 5 (card reads the fields). `decide(idx, decision)` signature matches the page wiring in Task 7. The connect href format (Task 5) matches the route's `?return=` parsing (Task 6).
