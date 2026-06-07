# Enhance-on-landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing `✦ Enhance` prompt-enhancement affordance to the landing/Assistant composer (`/`), reusing all in-chat machinery.

**Architecture:** Two frontend changes only. (1) Relax `createEnhance`'s `chatId` parameter to `string | null` so it can run without a chat (backend already accepts `chat_id: null`). (2) Wire a `createEnhance(null, …)` controller into `src/routes/(app)/+page.svelte` and pass it to `<Composer>` — Composer already renders the full enhance UI under `{#if enhance}`. No backend, BFF, or Composer.svelte change.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Vitest (`@testing-library/svelte` + `vitest-browser-svelte`), TypeScript.

---

### Task 1: Relax `createEnhance` chatId to `string | null`

**Files:**

- Modify: `src/lib/enhance/enhance.svelte.ts:3`
- Test: `src/lib/enhance/enhance.svelte.test.ts`

The backend `EnhancePromptRequest.chat_id` is `uuid | None = None`; the spike confirmed
`POST /enhance-prompt` returns 200 with `chat_id: null`. The POST body already interpolates
`chat_id: chatId`, so passing `null` emits `"chat_id": null` with **no body-logic change** — we
only relax the TypeScript signature and prove the wire shape with a test.

- [ ] **Step 1: Write the failing test**

Add this case to `src/lib/enhance/enhance.svelte.test.ts`. It captures the fetch body and
asserts the `null` chatId is forwarded as `chat_id: null`. (Match the existing tests' style for
the mocked `fetch` — they pass a fake `fetchFn` into `run`; reuse that pattern.)

```ts
it('sends chat_id: null when constructed with a null chatId (standalone landing enhance)', async () => {
	let capturedBody: unknown;
	const fetchFn = (async (_url: string, init: RequestInit) => {
		capturedBody = JSON.parse(init.body as string);
		return new Response(
			JSON.stringify({ expansion_applied: true, expanded_prompt: 'better', interaction_id: 'i1' }),
			{ status: 200, headers: { 'content-type': 'application/json' } }
		);
	}) as unknown as typeof fetch;

	const e = createEnhance(null, () => ['nda-review']);
	await e.run('draft a clause', fetchFn);

	expect(capturedBody).toEqual({
		raw_input: 'draft a clause',
		chat_id: null,
		attached_skills: [{ name: 'nda-review' }]
	});
	expect(e.status).toBe('preview');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/enhance/enhance.svelte.test.ts`
Expected: TypeScript/compile error — `createEnhance(null, …)` is not assignable to `chatId: string`
(the test file fails to type-check / the case fails). This proves the signature is too strict.

- [ ] **Step 3: Relax the signature**

In `src/lib/enhance/enhance.svelte.ts`, change line 3 only:

```ts
export function createEnhance(chatId: string | null, getSkills: () => string[]) {
```

Leave the body unchanged — `body: JSON.stringify({ raw_input: rawInput, chat_id: chatId, attached_skills: … })`
already produces `chat_id: null` when `chatId` is `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/enhance/enhance.svelte.test.ts`
Expected: PASS (all existing cases + the new null case).

- [ ] **Step 5: Run the full gate**

Run: `npm run check`
Expected: 0 errors / 0 warnings (the vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless).

- [ ] **Step 6: Commit**

```bash
git add src/lib/enhance/enhance.svelte.ts src/lib/enhance/enhance.svelte.test.ts
git commit -m "feat(enhance): allow createEnhance without a chat (chatId: string | null)"
```

---

### Task 2: Wire enhance into the landing composer

**Files:**

- Modify: `src/routes/(app)/+page.svelte`

Mirror the in-chat page, which does
`const enhance = untrack(() => createEnhance(data.chatId, () => skillAttach.names));`
(`src/routes/(app)/chats/[id]/+page.svelte:28`) and passes `{enhance}` to `<Composer>`. Landing
passes a literal `null`, so no `untrack` is needed (nothing reactive is read at construction).

- [ ] **Step 1: Import `createEnhance`**

In `src/routes/(app)/+page.svelte`, add the import alongside the other `$lib` imports (after the
`createSkillAttach` import on line 5):

```svelte
import {createEnhance} from '$lib/enhance/enhance.svelte';
```

- [ ] **Step 2: Construct the controller**

After `const skillAttach = createSkillAttach();` (line 14), add:

```svelte
const enhance = createEnhance(null, () => skillAttach.names);
```

- [ ] **Step 3: Pass it to `<Composer>`**

On the `<Composer … />` call (line 33), add the `{enhance}` prop. Resulting tag:

```svelte
<Composer
	bind:value={message}
	matters={data.matters}
	bind:selectedMatterId
	{skillAttach}
	{fileAttach}
	{enhance}
	{promptLibrary}
	onsubmit={() => formEl?.requestSubmit()}
/>
```

- [ ] **Step 4: Run the gate + tests**

Run: `npm run check && npx vitest run`
Expected: `check` = 0 errors / 0 warnings; vitest green (no regressions — the landing page has
no component test asserting absence of enhance; if `src/routes/(app)/page.server.test.ts` runs,
it is unaffected by this view-only change).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/+page.svelte"
git commit -m "feat(enhance): wire ✦ Enhance into the landing composer"
```

---

### Task 3: Live e2e verification (manual, no commit)

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and bring up the dev stack**

`donna-web` serves built code, so rebuild before testing. From the repo root:

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```

- [ ] **Step 2: Exercise the landing enhance**

1. Open http://localhost:13002 and sign in (`admin@lq.ai` / `$DONNA_E2E_PASSWORD`).
2. On the landing `Hi, …` screen, type a short prompt (e.g. `draft an nda clause`).
3. Confirm the `✦ Enhance` button appears in the composer (it is gated on the `enhance` prop).
4. Click it → confirm a loading state, then an `EnhancePreview` with an expanded prompt.
5. Click **accept** → confirm the landing draft text is replaced with the expansion.
6. (Optional) Attach a draft skill first, then enhance → the request includes the skill.

Expected: all steps succeed; no console errors. If `✦ Enhance` does not appear, the `{enhance}`
prop did not reach `<Composer>` — recheck Task 2 Step 3.

---

## Notes for the executor

- **Gate bar:** `npm run check` = 0 errors / 0 warnings is THE bar. `npm run lint` has ~53
  pre-existing errors on `main` (unadopted svelte rules) — do **not** treat those as regressions;
  just add no new ones.
- **Do not** modify `src/lib/components/Composer.svelte`, the BFF `(app)/enhance-prompt/` proxies,
  or any backend/vendor code — the enhance UI and proxies already work in-chat.
- Whole-branch Opus review follows execution, then `finishing-a-development-branch` → PR.
