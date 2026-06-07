# Donna P2a — Core Streaming Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/chats/[id]` route with a real, document-forward chat that streams assistant responses token-by-token from the lq-ai backend over SSE, rendering sanitized serif markdown and an inference-tier badge.

**Architecture:** A SvelteKit `+server` endpoint proxies the lq-ai streaming `POST …/messages` (via the existing `lqStream`) and pipes the `text/event-stream` straight back, so the JWT stays server-side. The client reads the stream with `fetch` + `ReadableStream`, parses `data: {json}\n\n` frames, and drives a runes-based `chatStream` controller that updates a message list. Citation markers render as plain text (interactive pills are P2b).

**Tech Stack:** SvelteKit/Svelte 5 (runes), `markdown-it` + `@mdit/plugin-katex` + `katex` + `isomorphic-dompurify` (sanitized serif markdown), Vitest + @testing-library/svelte, Playwright.

**Verified backend contract (from `vendor/lq-ai/docs/api/backend-openapi.yaml` + `api/app/api/chats.py`):**

- `GET /api/v1/chats/{id}/messages?limit=100` → `{ items: Message[], next_cursor }` (oldest-first).
- `POST /api/v1/chats/{id}/messages` body `{ content, model:"smart", stream:true }` → `text/event-stream`, frames as `data: <json>\n\n`, terminated by `data: [DONE]\n\n`:
  - `{type:"start", lq_ai_message_id, chat_id}`
  - `{type:"delta", delta, lq_ai_message_id, routed_inference_tier?, applied_skills?}`
  - `{type:"complete", lq_ai_message_id, message: Message, citations?, routed_inference_tier?, routed_provider?}`
  - error mid-stream: `{detail:{code, message, details?}}` (no `complete`).
- `Message = { id, chat_id, role, content, routed_inference_tier?, routed_provider?, routed_model?, created_at, ... }`.

> **Commit convention:** end every commit message with the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
>
> **Branch:** work on `p2a-streaming-chat` (already created off `main`, which has the P0+P1 foundation). Commit per task; the controller pushes.
>
> **`npm run check` note:** a harmless `ERR_MODULE_NOT_FOUND` vendor stderr appears; the run still reports `0 ERRORS` and exits 0. That's the success signal.

---

## File map

```
src/lib/chat/sse.ts                         # pure SSE frame parser (TDD)
src/lib/chat/sse.test.ts
src/lib/chat/chatStream.svelte.ts           # runes streaming controller (TDD)
src/lib/chat/chatStream.svelte.test.ts
src/lib/components/Markdown.svelte           # sanitized serif markdown (TDD)
src/lib/components/Markdown.svelte.test.ts
src/lib/components/Message.svelte            # one message row (TDD)
src/lib/components/Message.svelte.test.ts
src/lib/components/Composer.svelte           # MODIFY: add send↔stop toggle
src/routes/(app)/chats/[id]/messages/+server.ts   # BFF SSE proxy
src/routes/(app)/chats/[id]/+page.server.ts       # REPLACE: load history + draft
src/routes/(app)/chats/[id]/+page.svelte          # REPLACE placeholder: chat UI
src/app.css                                  # MODIFY: .prose-mlq + katex css import
tests/chat-streaming.spec.ts                 # e2e (Anthropic)
```

---

## Task 1: Dependencies + markdown/katex styling

**Files:** Modify `package.json` (deps), `src/app.css`.

- [ ] **Step 1: Install deps**

```bash
npm install markdown-it @mdit/plugin-katex katex isomorphic-dompurify
npm install -D @types/markdown-it
```

- [ ] **Step 2: Add prose styling + KaTeX CSS to `src/app.css`**

Append to `src/app.css`:

```css
/* KaTeX styles for math in chat answers */
@import 'katex/dist/katex.min.css';

/* Serif "legal memo" prose for assistant markdown */
.prose-mlq {
	font-family: var(--font-serif);
	color: var(--color-mlq-text);
	line-height: 1.65;
}
.prose-mlq p {
	margin: 0 0 0.75rem;
}
.prose-mlq h1,
.prose-mlq h2,
.prose-mlq h3 {
	color: var(--color-mlq-strong);
	font-weight: 500;
	margin: 1rem 0 0.5rem;
}
.prose-mlq ul,
.prose-mlq ol {
	margin: 0 0 0.75rem 1.25rem;
}
.prose-mlq li {
	margin: 0.15rem 0;
}
.prose-mlq a {
	color: var(--color-mlq-workflow);
	text-decoration: underline;
}
.prose-mlq table {
	border-collapse: collapse;
	margin: 0.5rem 0;
	font-size: 0.9em;
}
.prose-mlq th,
.prose-mlq td {
	border: 1px solid var(--color-mlq-subtle);
	padding: 4px 8px;
}
.prose-mlq blockquote {
	border-left: 3px solid var(--color-mlq-subtle);
	margin: 0 0 0.75rem;
	padding-left: 0.75rem;
	color: var(--color-mlq-muted);
}
.prose-mlq code {
	background: var(--color-mlq-surface-alt);
	padding: 1px 4px;
	border-radius: 4px;
	font-size: 0.9em;
}
```

- [ ] **Step 3: Verify**

```bash
npm run check   # expect: COMPLETED ... 0 ERRORS, exit 0
npm run build   # expect: clean build (confirms the katex css import resolves)
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app.css
git commit -m "feat(p2a): markdown/katex deps + serif prose styling"
```

---

## Task 2: SSE frame parser (TDD)

**Files:** Create `src/lib/chat/sse.ts`; Test: `src/lib/chat/sse.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/lib/chat/sse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDataPayload, createSseParser } from './sse';

describe('parseDataPayload', () => {
	it('recognizes [DONE]', () => {
		expect(parseDataPayload('[DONE]')).toEqual({ type: 'done' });
	});
	it('parses a delta frame', () => {
		expect(
			parseDataPayload(
				'{"type":"delta","delta":"hi","lq_ai_message_id":"m1","routed_inference_tier":3}'
			)
		).toMatchObject({ type: 'delta', delta: 'hi', routed_inference_tier: 3 });
	});
	it('maps the detail error envelope to an error frame', () => {
		expect(parseDataPayload('{"detail":{"code":"gateway_timeout","message":"timed out"}}')).toEqual(
			{ type: 'error', code: 'gateway_timeout', message: 'timed out' }
		);
	});
	it('returns null for non-JSON', () => {
		expect(parseDataPayload('not json')).toBeNull();
	});
});

describe('createSseParser', () => {
	it('emits one frame for a complete event', () => {
		const p = createSseParser();
		const frames = p.push('data: {"type":"start","lq_ai_message_id":"m1","chat_id":"c1"}\n\n');
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ type: 'start', lq_ai_message_id: 'm1' });
	});
	it('buffers a frame split across two chunks', () => {
		const p = createSseParser();
		expect(p.push('data: {"type":"delta","delta":"he')).toHaveLength(0);
		const frames = p.push('llo","lq_ai_message_id":"m1"}\n\n');
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ type: 'delta', delta: 'hello' });
	});
	it('emits multiple frames in one chunk and stops at [DONE]', () => {
		const p = createSseParser();
		const frames = p.push(
			'data: {"type":"delta","delta":"a","lq_ai_message_id":"m1"}\n\n' + 'data: [DONE]\n\n'
		);
		expect(frames.map((f) => f.type)).toEqual(['delta', 'done']);
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/chat/sse.test.ts   # FAIL: module missing
```

- [ ] **Step 3: Implement `src/lib/chat/sse.ts`**

```ts
export type StreamFrame =
	| { type: 'start'; lq_ai_message_id: string; chat_id: string }
	| {
			type: 'delta';
			delta: string;
			lq_ai_message_id: string;
			routed_inference_tier?: number | null;
			applied_skills?: string[];
	  }
	| {
			type: 'complete';
			lq_ai_message_id: string;
			message: {
				id: string;
				content: string;
				routed_inference_tier?: number | null;
				routed_provider?: string | null;
			};
			citations?: unknown[];
			routed_inference_tier?: number | null;
	  }
	| { type: 'error'; code?: string; message: string }
	| { type: 'done' };

/** Parse one SSE `data:` payload into a typed frame, or null to skip. */
export function parseDataPayload(payload: string): StreamFrame | null {
	if (payload === '[DONE]') return { type: 'done' };
	let obj: unknown;
	try {
		obj = JSON.parse(payload);
	} catch {
		return null;
	}
	if (obj && typeof obj === 'object') {
		const o = obj as Record<string, unknown>;
		if (o.type === 'start' || o.type === 'delta' || o.type === 'complete') {
			return o as unknown as StreamFrame;
		}
		if (o.detail && typeof o.detail === 'object') {
			const d = o.detail as Record<string, unknown>;
			return {
				type: 'error',
				code: d.code as string | undefined,
				message: (d.message as string) ?? 'Stream failed'
			};
		}
	}
	return null;
}

/** Stateful parser: feed decoded text chunks, get frames for each complete `\n\n`-terminated event. */
export function createSseParser() {
	let buffer = '';
	return {
		push(chunk: string): StreamFrame[] {
			buffer += chunk;
			const frames: StreamFrame[] = [];
			let idx: number;
			while ((idx = buffer.indexOf('\n\n')) !== -1) {
				const rawEvent = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				const dataLines = rawEvent.split('\n').filter((l) => l.startsWith('data:'));
				if (dataLines.length === 0) continue;
				const payload = dataLines.map((l) => l.slice(5).replace(/^ /, '')).join('\n');
				const frame = parseDataPayload(payload);
				if (frame) frames.push(frame);
			}
			return frames;
		}
	};
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/chat/sse.test.ts   # 7 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/sse.ts src/lib/chat/sse.test.ts
git commit -m "feat(p2a): SSE frame parser"
```

---

## Task 3: Streaming controller `chatStream` (TDD)

**Files:** Create `src/lib/chat/chatStream.svelte.ts`; Test: `src/lib/chat/chatStream.svelte.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/lib/chat/chatStream.svelte.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createChatStream } from './chatStream.svelte';

function streamResponse(frames: string[]): Response {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const enc = new TextEncoder();
			for (const f of frames) controller.enqueue(enc.encode(f));
			controller.close();
		}
	});
	return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('createChatStream', () => {
	it('appends user + assistant, accumulates deltas, finalizes on complete', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					streamResponse([
						'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
						'data: {"type":"delta","delta":"Hel","lq_ai_message_id":"a1","routed_inference_tier":3}\n\n',
						'data: {"type":"delta","delta":"lo","lq_ai_message_id":"a1"}\n\n',
						'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Hello","routed_inference_tier":3}}\n\n',
						'data: [DONE]\n\n'
					])
				)
		);
		const chat = createChatStream('c1');
		await chat.send('hi');
		expect(chat.messages).toHaveLength(2);
		expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
		expect(chat.messages[1]).toMatchObject({
			role: 'assistant',
			content: 'Hello',
			routed_inference_tier: 3,
			status: 'done'
		});
		expect(chat.status).toBe('idle');
	});

	it('sets error status on an error frame', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					streamResponse([
						'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
						'data: {"detail":{"code":"gateway_timeout","message":"timed out"}}\n\n'
					])
				)
		);
		const chat = createChatStream('c1');
		await chat.send('hi');
		expect(chat.messages[1].status).toBe('error');
		expect(chat.messages[1].error).toMatch(/timed out/);
		expect(chat.status).toBe('error');
	});

	it('marks the assistant done (keeps partial text) when aborted', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
		);
		const chat = createChatStream('c1');
		await chat.send('hi');
		expect(chat.status).toBe('idle');
		expect(chat.messages[1].status).toBe('done');
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/chat/chatStream.svelte.test.ts   # FAIL: module missing
```

- [ ] **Step 3: Implement `src/lib/chat/chatStream.svelte.ts`**

```ts
import { createSseParser, type StreamFrame } from './sse';

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	routed_inference_tier?: number | null;
	status?: 'streaming' | 'done' | 'error';
	error?: string;
	citations?: unknown[];
}

export function createChatStream(chatId: string, initial: ChatMessage[] = []) {
	let messages = $state<ChatMessage[]>(initial);
	let status = $state<'idle' | 'streaming' | 'error'>('idle');
	let controller: AbortController | null = null;

	function setError(idx: number, msg: string) {
		messages[idx].status = 'error';
		messages[idx].error = msg;
		status = 'error';
	}

	function applyFrame(idx: number, frame: StreamFrame) {
		const m = messages[idx];
		if (frame.type === 'start') {
			m.id = frame.lq_ai_message_id;
		} else if (frame.type === 'delta') {
			m.content += frame.delta;
			if (frame.routed_inference_tier != null)
				m.routed_inference_tier = frame.routed_inference_tier;
		} else if (frame.type === 'complete') {
			m.id = frame.message.id ?? m.id;
			m.content = frame.message.content ?? m.content;
			const tier = frame.message.routed_inference_tier ?? frame.routed_inference_tier;
			if (tier != null) m.routed_inference_tier = tier;
			m.citations = frame.citations ?? [];
			m.status = 'done';
		} else if (frame.type === 'error') {
			setError(idx, frame.message);
		}
	}

	async function send(content: string) {
		if (status === 'streaming') return;
		messages = [
			...messages,
			{ id: crypto.randomUUID(), role: 'user', content },
			{ id: 'pending', role: 'assistant', content: '', status: 'streaming' }
		];
		const idx = messages.length - 1;
		status = 'streaming';
		controller = new AbortController();
		try {
			const res = await fetch(`/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content }),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				setError(idx, 'Could not reach the model. Please try again.');
				return;
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			const parser = createSseParser();
			let ended = false;
			while (!ended) {
				const { value, done } = await reader.read();
				if (done) break;
				for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
					if (frame.type === 'done') {
						ended = true;
						break;
					}
					applyFrame(idx, frame);
					if (frame.type === 'error') {
						ended = true;
						break;
					}
				}
			}
			if (messages[idx].status === 'streaming') messages[idx].status = 'done';
			if (status === 'streaming') status = 'idle';
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

	function stop() {
		controller?.abort();
	}

	return {
		get messages() {
			return messages;
		},
		get status() {
			return status;
		},
		send,
		stop
	};
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/chat/chatStream.svelte.test.ts   # 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(p2a): runes streaming controller (send/stop, frame application)"
```

---

## Task 4: Sanitized serif markdown component (TDD)

**Files:** Create `src/lib/components/Markdown.svelte`; Test: `src/lib/components/Markdown.svelte.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/lib/components/Markdown.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Markdown from './Markdown.svelte';

describe('Markdown', () => {
	it('renders GFM markdown (bold, list)', () => {
		const { container } = render(Markdown, {
			props: { content: '**bold** and\n\n- item one\n- item two' }
		});
		expect(container.querySelector('strong')?.textContent).toBe('bold');
		expect(container.querySelectorAll('li')).toHaveLength(2);
	});

	it('sanitizes embedded HTML — no script survives', () => {
		const { container } = render(Markdown, {
			props: { content: 'hi <script>alert(1)</script> there' }
		});
		expect(container.querySelector('script')).toBeNull();
		expect(container.innerHTML).not.toContain('alert(1)');
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/components/Markdown.svelte.test.ts   # FAIL: component missing
```

- [ ] **Step 3: Implement `src/lib/components/Markdown.svelte`**

```svelte
<script lang="ts">
	import MarkdownIt from 'markdown-it';
	import { katex } from '@mdit/plugin-katex';
	import DOMPurify from 'isomorphic-dompurify';

	let { content = '' }: { content?: string } = $props();

	// html:false → raw HTML in the source is escaped (closes the main injection
	// vector); DOMPurify is defense-in-depth over plugin-emitted HTML (KaTeX).
	const md = new MarkdownIt({ html: false, linkify: true, breaks: true }).use(katex);

	const html = $derived(DOMPurify.sanitize(md.render(content ?? '')));
</script>

<div class="prose-mlq">{@html html}</div>
```

> If `@mdit/plugin-katex`'s `katex` named export does not exist at the installed version, check its entry (`node -e "console.log(Object.keys(require('@mdit/plugin-katex')))"`) and use the correct export name. If KaTeX wiring is genuinely broken at the pinned version, ship **without** the `.use(katex)` call (GFM-only) and note it in the report — math is non-critical for P2a. Do NOT remove DOMPurify.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/components/Markdown.svelte.test.ts   # 2 tests pass
npm run check   # 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Markdown.svelte src/lib/components/Markdown.svelte.test.ts
git commit -m "feat(p2a): sanitized serif markdown renderer"
```

---

## Task 5: Message row component (TDD)

**Files:** Create `src/lib/components/Message.svelte`; Test: `src/lib/components/Message.svelte.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/lib/components/Message.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Message from './Message.svelte';

describe('Message', () => {
	it('renders a user turn as a plain chip (no markdown block)', () => {
		const { container, getByText } = render(Message, {
			props: { message: { id: 'u1', role: 'user', content: 'hello there' } }
		});
		expect(getByText('hello there')).toBeInTheDocument();
		expect(container.querySelector('.prose-mlq')).toBeNull();
	});

	it('renders an assistant turn as markdown prose with the tier chip', () => {
		const { container, getByText } = render(Message, {
			props: {
				message: {
					id: 'a1',
					role: 'assistant',
					content: '**done**',
					routed_inference_tier: 3,
					status: 'done'
				}
			}
		});
		expect(container.querySelector('.prose-mlq')).not.toBeNull();
		expect(getByText(/Tier 3/)).toBeInTheDocument();
	});

	it('shows an error with a Retry button that calls onretry', async () => {
		let retried = false;
		const { getByRole } = render(Message, {
			props: {
				message: {
					id: 'a1',
					role: 'assistant',
					content: '',
					status: 'error',
					error: 'gateway timeout'
				},
				onretry: () => (retried = true)
			}
		});
		getByRole('button', { name: /retry/i }).click();
		expect(retried).toBe(true);
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/components/Message.svelte.test.ts   # FAIL: component missing
```

- [ ] **Step 3: Implement `src/lib/components/Message.svelte`**

```svelte
<script lang="ts">
	import Markdown from './Markdown.svelte';
	import type { ChatMessage } from '$lib/chat/chatStream.svelte';

	let { message, onretry }: { message: ChatMessage; onretry?: () => void } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(message.content);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable — ignore */
		}
	}
</script>

{#if message.role === 'user'}
	<div class="my-2 text-right">
		<span
			class="inline-block max-w-[80%] rounded-2xl bg-mlq-surface-alt px-3 py-1.5 text-left text-sm text-mlq-text"
			>{message.content}</span
		>
	</div>
{:else}
	<div class="my-4 text-sm">
		{#if message.routed_inference_tier != null}
			<span
				class="float-right ml-2 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
				>Tier {message.routed_inference_tier}</span
			>
		{:else if message.status === 'streaming'}
			<span
				class="float-right ml-2 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
				>Tier…</span
			>
		{/if}

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
		{:else}
			{#if message.content === '' && message.status === 'streaming'}
				<span
					class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle"
					aria-label="Generating"
				></span>
			{:else}
				<Markdown content={message.content} />
			{/if}
			{#if message.status === 'streaming' && message.content !== ''}
				<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-mlq-text align-text-bottom"
				></span>
			{/if}
			{#if message.status === 'done'}
				<div class="mt-2 text-xs text-mlq-muted">
					<button
						type="button"
						onclick={copy}
						class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
						>{copied ? '✓ copied' : '⧉ Copy'}</button
					>
				</div>
			{/if}
		{/if}
	</div>
{/if}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/components/Message.svelte.test.ts   # 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(p2a): Message row (user chip / assistant prose, tier, caret, copy, retry)"
```

---

## Task 6: Composer send↔stop toggle (modify, TDD)

**Files:** Modify `src/lib/components/Composer.svelte`; Test: extend `src/lib/components/Composer.test.ts`.

- [ ] **Step 1: Add a failing test for the stop control**

Append to `src/lib/components/Composer.test.ts` (inside the existing `describe('Composer', …)`):

```ts
it('shows a Stop button while streaming and calls onstop', async () => {
	const onstop = vi.fn();
	const { getByRole } = render(Composer, { props: { streaming: true, onstop } });
	const btn = getByRole('button', { name: /stop/i });
	btn.click();
	expect(onstop).toHaveBeenCalledTimes(1);
});
```

(Ensure `vi` is imported in that test file — it already is.)

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/components/Composer.test.ts   # the new test fails (no Stop button)
```

- [ ] **Step 3: Modify `src/lib/components/Composer.svelte`**

Update the script props and the action button. The new props:

```svelte
<script lang="ts">
	import { ArrowRight, Square } from '@lucide/svelte';

	let {
		value = $bindable(''),
		placeholder = 'Ask a question about your documents…',
		onsubmit,
		streaming = false,
		onstop
	}: {
		value?: string;
		placeholder?: string;
		onsubmit?: (text: string) => void;
		streaming?: boolean;
		onstop?: () => void;
	} = $props();

	let textarea = $state<HTMLTextAreaElement>();

	function autogrow() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
	}
	function submit() {
		const text = value.trim();
		if (!text) return;
		onsubmit?.(text);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!streaming) submit();
		}
	}
</script>
```

Replace the single send button with a streaming-aware control (keep the textarea markup unchanged):

```svelte
{#if streaming}
	<button
		type="button"
		onclick={() => onstop?.()}
		aria-label="Stop"
		class="rounded-mlq-control bg-mlq-strong p-2 text-white"
	>
		<Square size={18} />
	</button>
{:else}
	<button
		type="button"
		onclick={submit}
		disabled={!value.trim()}
		aria-label="Send"
		class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40"
	>
		<ArrowRight size={18} />
	</button>
{/if}
```

- [ ] **Step 4: Run — expect PASS (all Composer tests, incl. the originals)**

```bash
npx vitest run src/lib/components/Composer.test.ts   # 4 tests pass
npm run check   # 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.test.ts
git commit -m "feat(p2a): Composer send↔stop toggle while streaming"
```

---

## Task 7: BFF SSE proxy endpoint

**Files:** Create `src/routes/(app)/chats/[id]/messages/+server.ts`.

- [ ] **Step 1: Implement the proxy**

```ts
import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
	let content = '';
	try {
		const body = (await event.request.json()) as { content?: string };
		content = (body.content ?? '').trim();
	} catch {
		content = '';
	}

	const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
		method: 'POST',
		body: JSON.stringify({ content, model: 'smart', stream: true })
	});

	// Pipe the upstream SSE body straight through (no buffering). On a non-2xx
	// upstream the body is the JSON error envelope; forward status + body so the
	// client's res.ok check surfaces it.
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
			'cache-control': 'no-cache'
		}
	});
};
```

- [ ] **Step 2: Verify type-check + build**

```bash
npm run check   # 0 errors
npm run build   # clean (route compiles)
```

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/messages/+server.ts"
git commit -m "feat(p2a): BFF SSE proxy for streaming messages"
```

---

## Task 8: Chat page — load history + draft, render conversation

**Files:** Replace `src/routes/(app)/chats/[id]/+page.server.ts` and `src/routes/(app)/chats/[id]/+page.svelte` (both currently placeholders from P1).

- [ ] **Step 1: Replace `+page.server.ts`**

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ChatMessage } from '$lib/chat/chatStream.svelte';

export const load: PageServerLoad = async (event) => {
	const draft = event.cookies.get('donna_draft') ?? null;
	if (draft) event.cookies.delete('donna_draft', { path: '/' });

	const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages?limit=100`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load this chat.');
	const page = (await res.json()) as { items: ChatMessage[] };

	const messages: ChatMessage[] = page.items.map((m) => ({
		id: m.id,
		role: m.role,
		content: m.content,
		routed_inference_tier: m.routed_inference_tier,
		status: 'done'
	}));

	return { chatId: event.params.id, messages, draft };
};
```

- [ ] **Step 2: Replace `+page.svelte`**

```svelte
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Composer from '$lib/components/Composer.svelte';
	import Message from '$lib/components/Message.svelte';
	import { createChatStream } from '$lib/chat/chatStream.svelte';

	let { data } = $props();

	const chat = createChatStream(data.chatId, data.messages);
	let draftValue = $state('');
	let scroller = $state<HTMLElement>();
	let lastUserContent = '';

	function submit(text: string) {
		lastUserContent = text;
		draftValue = '';
		chat.send(text);
	}
	function retry() {
		if (lastUserContent) chat.send(lastUserContent);
	}

	// Auto-scroll to the newest content as messages/stream update.
	$effect(() => {
		// touch reactive deps
		const _len = chat.messages.length;
		const _last = chat.messages[chat.messages.length - 1]?.content;
		void _len;
		void _last;
		tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
	});

	// Land → stream: if the landing handed us a draft and this is a fresh chat, send it.
	onMount(() => {
		if (data.draft && data.messages.length === 0) submit(data.draft);
	});
</script>

<div class="flex h-full flex-col">
	<div bind:this={scroller} class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl px-6 py-8">
			{#each chat.messages as m (m.id + m.role)}
				<Message message={m} onretry={retry} />
			{/each}
		</div>
	</div>

	<div class="mx-auto w-full max-w-2xl px-6 pb-4">
		<Composer
			bind:value={draftValue}
			onsubmit={submit}
			streaming={chat.status === 'streaming'}
			onstop={chat.stop}
		/>
		<p class="mt-2 text-center text-xs text-mlq-muted">
			AI can make mistakes. Answers are not legal advice.
		</p>
	</div>
</div>
```

> Note: the `{#each}` key `m.id + m.role` — the assistant message starts with id `"pending"` and is reassigned to the real id on the `start` frame. Since Svelte 5 keyed-each re-creates the node when the key changes, this is acceptable here (the node swaps once at stream start, before content arrives). Do not key on array index.

- [ ] **Step 3: Verify type-check + build**

```bash
npm run check   # 0 errors
npm run build   # clean
```

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.server.ts" "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p2a): chat page — load history + draft, render streaming conversation"
```

---

## Task 9: E2E against a real Anthropic stream

**Files:** Create `tests/chat-streaming.spec.ts`.

> **Prerequisites (the controller sets these up before running):**
>
> - `.env` has `ANTHROPIC_API_KEY` (already added, gitignored).
> - The gateway's `smart` alias maps to a Claude model. **Confirm/seed this:** inspect the running gateway config — `docker compose exec gateway sh -c 'cat /app/gateway.yaml 2>/dev/null || cat gateway.yaml'` — and verify a `smart` (or default) alias routes to an `anthropic` provider model. If absent, set it per `vendor/lq-ai/gateway.yaml.example` and restart the gateway. Record the working alias in `docs/decisions/lq-ai-pin.md`.
> - Stack up on shifted ports with the rebuilt `donna-web`: `docker compose up -d --build postgres redis minio gateway api donna-web`.
> - Login-ready admin fixture exists (from P0+P1): `admin@lq.ai` / the `.env` `DONNA_E2E_PASSWORD`.

- [ ] **Step 1: Write the e2e**

`tests/chat-streaming.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('streams an assistant reply with a resolved tier, and it persists on reload', async ({
	page
}) => {
	await login(page);
	await page.fill('textarea', 'In one short sentence, what is an NDA?');
	await page.keyboard.press('Enter');

	// Routed into a chat
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);

	// Assistant content streams in (non-empty prose), tier chip resolves to a number
	const assistant = page.locator('.prose-mlq').last();
	await expect(assistant).not.toBeEmpty({ timeout: 30000 });
	await expect(page.getByText(/Tier \d/)).toBeVisible({ timeout: 30000 });

	// Persists across reload (history load path)
	const text = (await assistant.innerText()).slice(0, 20);
	await page.reload();
	await expect(page.locator('.prose-mlq').last()).toContainText(text);
});

test('Stop halts a stream and leaves partial text', async ({ page }) => {
	await login(page);
	await page.goto('/');
	await page.fill('textarea', 'List five common contract clauses with a sentence each.');
	await page.keyboard.press('Enter');
	// Stop appears while streaming
	const stop = page.getByRole('button', { name: /stop/i });
	await expect(stop).toBeVisible({ timeout: 30000 });
	await stop.click();
	// Composer returns to send mode; some assistant text remains
	await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
	await expect(page.locator('.prose-mlq').last()).not.toBeEmpty();
});
```

- [ ] **Step 2: Run the e2e against the live stack**

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web
npx playwright test tests/chat-streaming.spec.ts
```

Expected: both tests pass. (The full suite — `npx playwright test` — should also stay green: the P0+P1 specs + these.)

- [ ] **Step 3: Commit**

```bash
git add tests/chat-streaming.spec.ts
git commit -m "test(p2a): e2e streaming chat against a live Anthropic-backed stack"
```

---

## Task 10: Full verification gate

**Files:** none (verification + any doc note).

- [ ] **Step 1: Run the complete gate**

```bash
set -a; . ./.env; set +a
npm run check            # 0 errors, 0 warnings
npx vitest run           # all unit/component tests pass (P0+P1 + P2a)
docker compose up -d --build postgres redis minio gateway api donna-web
npx playwright test      # all e2e pass (P0+P1 auth/landing + P2a streaming)
```

Expected: every command green. If the gateway `smart` alias wasn't mapped to Claude, the streaming e2e fails fast with a gateway error — fix the alias (Task 9 prerequisite) and re-run.

- [ ] **Step 2: Record any gateway-alias setup performed**

If you had to set the `smart`→Claude alias, append a short note to `docs/decisions/lq-ai-pin.md` under "Known follow-ups" describing the alias config used, then:

```bash
git add docs/decisions/lq-ai-pin.md
git commit -m "docs(p2a): record gateway smart-alias config for streaming"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** history load (T8), streaming send via BFF (T3, T7), serif sanitized markdown (T4), document-forward Message layout + tier badge + caret + copy (T5), send↔stop (T6), the P1→P2 draft auto-send join (T8), error/retry + abort (T3, T5), e2e with Anthropic (T9), gate (T10). Citation markers render as plain text (no pill task — correct for P2a; pills are P2b).
- **Type consistency:** `ChatMessage` defined in `chatStream.svelte.ts` (T3) and imported by `Message.svelte` (T5) and `+page.server.ts` (T8). `StreamFrame` defined in `sse.ts` (T2), consumed in T3. The client POSTs to `/chats/{id}/messages` (T3) which is the BFF endpoint created in T7. `lqStream` signature matches P0+P1's `src/lib/server/lqClient.ts`.
- **No placeholders:** every code step is complete. The two soft spots are handled explicitly, not deferred: KaTeX export-name check with a GFM-only fallback (T4), and the gateway `smart`-alias verification as a documented T9 prerequisite.
