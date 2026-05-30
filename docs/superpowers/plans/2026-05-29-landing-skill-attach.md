# Landing Skill-Attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach a skill on the landing/Assistant composer and have it applied to their first message.

**Architecture:** Surface the existing `⊕ Skill` control (P2c-B2) on the landing composer by passing it a `createSkillAttach()` controller. Carry the chosen skill slugs through the landing → new-chat → first-send hop with a one-shot `donna_draft_skills` cookie that mirrors the existing `donna_draft` (message) cookie: `?/start` sets it, the chat `[id]` `load` reads/deletes/parses it, and the chat page's `onMount` auto-send threads the slugs into the first `chat.send(content, model, skills)`.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, vitest + `@testing-library/svelte`, Playwright. No backend change (pin `438198c`).

**Spec:** `docs/superpowers/specs/2026-05-29-landing-skill-attach-design.md`

**Conventions:**
- After code steps: `npm run check` = exit 0 + "0 errors and 0 warnings" (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless); `npx eslint <touched files>` clean (no `any`).
- Run a single unit file with `npx vitest run <path>`. Exact-string Testing-Library queries.
- Commit per task with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Route paths contain a `(app)` group and a `[id]` segment — **quote shell paths**.

## File Structure

**Create:**
- `src/routes/(app)/chats/[id]/draftSkills.ts` — `parseDraftSkills(raw)` pure helper (mirrors the route-local `matter.ts` pattern).
- `src/routes/(app)/chats/[id]/draftSkills.test.ts` — its unit test.
- `tests/landing-skill-attach.spec.ts` — live e2e.

**Modify:**
- `src/routes/(app)/chats/[id]/+page.server.ts` — `load` reads/deletes/parses the `donna_draft_skills` cookie → `draftSkills`.
- `src/routes/(app)/+page.server.ts` — `?/start` reads `skills`, sets the `donna_draft_skills` cookie.
- `src/routes/(app)/page.server.test.ts` — add start-action skills tests.
- `src/routes/(app)/+page.svelte` — instantiate `createSkillAttach`, pass to `<Composer>`, render hidden `skills` inputs.
- `src/routes/(app)/chats/[id]/+page.svelte` — `onMount` threads `data.draftSkills` into the first `submit`.

**Unchanged (reused):** `Composer.svelte`, `SkillAttach.svelte`, `src/lib/skills/attach.svelte.ts` (`createSkillAttach`) — already gate the control on the `skillAttach` prop and were unit-tested in P2c-B2.

**Test strategy note:** the cookie *contract* (parse + set) is unit-tested (Tasks 1–2). The two thin wiring changes (landing passes the controller + hidden inputs, Task 3; chat `onMount` threads the slugs, Task 4) are intentionally covered by the **live e2e** (Task 5) rather than brittle full-page component renders — the components they compose are already unit-tested, and the e2e asserts the slugs reach the message POST end-to-end. The chat `load` has no existing unit test (mirrors the codebase's current coverage of that loader); its 3-line cookie wiring is e2e-covered, while the parse logic is unit-tested in isolation.

---

## Task 1: `parseDraftSkills` helper + wire into chat load

**Files:**
- Create: `src/routes/(app)/chats/[id]/draftSkills.ts`
- Test: `src/routes/(app)/chats/[id]/draftSkills.test.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`

- [ ] **Step 1: Write the failing test** `src/routes/(app)/chats/[id]/draftSkills.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseDraftSkills } from './draftSkills';

describe('parseDraftSkills', () => {
  it('parses a JSON array of slugs', () => {
    expect(parseDraftSkills('["contract-qa","nda-review"]')).toEqual(['contract-qa', 'nda-review']);
  });
  it('returns [] for null/undefined', () => {
    expect(parseDraftSkills(null)).toEqual([]);
    expect(parseDraftSkills(undefined)).toEqual([]);
  });
  it('returns [] for malformed JSON', () => {
    expect(parseDraftSkills('not json')).toEqual([]);
  });
  it('drops non-string entries', () => {
    expect(parseDraftSkills('["a",1,null,"b"]')).toEqual(['a', 'b']);
  });
  it('returns [] when the JSON is not an array', () => {
    expect(parseDraftSkills('{"a":1}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftSkills.test.ts"`
Expected: FAIL — cannot find `./draftSkills`.

- [ ] **Step 3: Implement** `src/routes/(app)/chats/[id]/draftSkills.ts`

```ts
/**
 * Parse the one-shot `donna_draft_skills` cookie (a JSON array of skill slugs,
 * set by the landing `?/start` action) into a safe `string[]`. Tolerates a
 * missing or malformed cookie by returning an empty list.
 */
export function parseDraftSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftSkills.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into the chat load** — edit `src/routes/(app)/chats/[id]/+page.server.ts`

Add the import near the other route-local imports (e.g. below `import { resolveMatter } from './matter';`):

```ts
import { parseDraftSkills } from './draftSkills';
```

Replace the opening two lines of `load` (the `donna_draft` block):

```ts
  const draft = event.cookies.get('donna_draft') ?? null;
  if (draft) event.cookies.delete('donna_draft', { path: '/' });
```

with:

```ts
  const draft = event.cookies.get('donna_draft') ?? null;
  if (draft) event.cookies.delete('donna_draft', { path: '/' });
  const rawDraftSkills = event.cookies.get('donna_draft_skills');
  if (rawDraftSkills) event.cookies.delete('donna_draft_skills', { path: '/' });
  const draftSkills = parseDraftSkills(rawDraftSkills);
```

Change the final return of `load` from:

```ts
  return { chatId: event.params.id, messages, draft, matter };
```

to:

```ts
  return { chatId: event.params.id, messages, draft, draftSkills, matter };
```

- [ ] **Step 6: Verify**

Run: `npm run check` → exit 0 + "0 errors and 0 warnings".
Run: `npx eslint "src/routes/(app)/chats/[id]/draftSkills.ts" "src/routes/(app)/chats/[id]/draftSkills.test.ts" "src/routes/(app)/chats/[id]/+page.server.ts"` → clean.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/chats/[id]/draftSkills.ts" "src/routes/(app)/chats/[id]/draftSkills.test.ts" "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat: parse donna_draft_skills cookie into chat load draftSkills

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Landing `?/start` stashes attached skills

**Files:**
- Modify: `src/routes/(app)/+page.server.ts`
- Test: `src/routes/(app)/page.server.test.ts`

- [ ] **Step 1: Write the failing tests** — add to `src/routes/(app)/page.server.test.ts`, inside the existing `describe('landing start action', …)` block:

```ts
  it('stashes attached skills in the donna_draft_skills cookie', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat3' }), { status: 201 }));
    const c = cookies();
    const body = new URLSearchParams();
    body.append('message', 'hi');
    body.append('project_id', '');
    body.append('skills', 'contract-qa');
    body.append('skills', 'nda-review');
    const ev = { request: new Request('http://x', { method: 'POST', body }), cookies: c } as never;
    await expect(actions.start(ev)).rejects.toMatchObject({ status: 303, location: '/chats/chat3' });
    const call = c.set.mock.calls.find((x: unknown[]) => x[0] === 'donna_draft_skills');
    expect(call).toBeTruthy();
    expect(JSON.parse(call![1] as string)).toEqual(['contract-qa', 'nda-review']);
  });

  it('sets no donna_draft_skills cookie when no skills are attached', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat4' }), { status: 201 }));
    const c = cookies();
    const ev = { request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ message: 'hi', project_id: '' }) }), cookies: c } as never;
    await expect(actions.start(ev)).rejects.toMatchObject({ status: 303 });
    expect(c.set.mock.calls.find((x: unknown[]) => x[0] === 'donna_draft_skills')).toBeFalsy();
  });
```

(The file already defines `const cookies = () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() });` and imports `actions` — reuse them.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run "src/routes/(app)/page.server.test.ts"`
Expected: FAIL — no `donna_draft_skills` cookie is set yet (the `.find(...)` is `undefined`).

- [ ] **Step 3: Implement** — edit the `start` action in `src/routes/(app)/+page.server.ts`

After `const projectId = String(data.get('project_id') ?? '').trim();`, add:

```ts
    const skills = data.getAll('skills').map(String).filter(Boolean);
```

Then, after the existing `donna_draft` cookie block:

```ts
    if (message) {
      event.cookies.set('donna_draft', message, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 120 });
    }
```

add:

```ts
    if (skills.length) {
      event.cookies.set('donna_draft_skills', JSON.stringify(skills), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 120 });
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run "src/routes/(app)/page.server.test.ts"`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 5: Verify**

Run: `npm run check` → 0/0.
Run: `npx eslint "src/routes/(app)/+page.server.ts" "src/routes/(app)/page.server.test.ts"` → clean.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/+page.server.ts" "src/routes/(app)/page.server.test.ts"
git commit -m "feat: landing ?/start stashes attached skills in donna_draft_skills

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Surface skill-attach on the landing composer

**Files:**
- Modify: `src/routes/(app)/+page.svelte`

> Wiring change; verified by `npm run check` + the live e2e (Task 5). No unit test — the landing page instantiates its `skillAttach` internally (not injectable), so attached-state can't be seeded in a component test; the e2e exercises the real attach → hidden-inputs → cookie path.

- [ ] **Step 1: Edit `src/routes/(app)/+page.svelte`**

Add the import after `import Composer from '$lib/components/Composer.svelte';`:

```svelte
  import { createSkillAttach } from '$lib/skills/attach.svelte';
```

In the `<script>`, after `let formEl = $state<HTMLFormElement>();`, add:

```svelte
  const skillAttach = createSkillAttach();
```

In the form, add hidden skill inputs and pass the controller to `<Composer>`. Change the form body from:

```svelte
  <form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
    <input type="hidden" name="message" value={message} />
    <input type="hidden" name="project_id" value={selectedMatterId ?? ''} />
    <Composer bind:value={message} matters={data.matters} bind:selectedMatterId onsubmit={() => formEl?.requestSubmit()} />
  </form>
```

to:

```svelte
  <form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
    <input type="hidden" name="message" value={message} />
    <input type="hidden" name="project_id" value={selectedMatterId ?? ''} />
    {#each skillAttach.names as s (s)}
      <input type="hidden" name="skills" value={s} />
    {/each}
    <Composer bind:value={message} matters={data.matters} bind:selectedMatterId {skillAttach} onsubmit={() => formEl?.requestSubmit()} />
  </form>
```

- [ ] **Step 2: Verify**

Run: `npm run check` → 0/0.
Run: `npx eslint "src/routes/(app)/+page.svelte"` → clean.
Manual sanity (optional, if the stack is up): load `http://localhost:13002/` → the composer control row now shows a `⊕ Skill` button next to the model picker (it did not before).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/+page.svelte"
git commit -m "feat: show skill-attach control on the landing composer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Thread draft skills into the first auto-send

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

> One-line wiring; verified by `npm run check` + the live e2e (Task 5).

- [ ] **Step 1: Edit the `onMount` in `src/routes/(app)/chats/[id]/+page.svelte`**

Change:

```ts
  onMount(() => {
    if (data.draft && data.messages.length === 0) submit(data.draft, modelStore.selectedModel);
  });
```

to:

```ts
  onMount(() => {
    if (data.draft && data.messages.length === 0) submit(data.draft, modelStore.selectedModel, data.draftSkills ?? []);
  });
```

(`submit(text, model, skills)` already accepts a third `skills` arg and forwards it to `chat.send`.)

- [ ] **Step 2: Verify**

Run: `npm run check` → 0/0 (this also confirms `data.draftSkills` is a known field on the load's return type from Task 1).
Run: `npx eslint "src/routes/(app)/chats/[id]/+page.svelte"` → clean.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat: apply landing-attached skills to the first chat message

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Live e2e + verify + PR

**Files:**
- Create: `tests/landing-skill-attach.spec.ts`

- [ ] **Step 1: Rebuild `donna-web`** (the container serves a built image)

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```
Wait until `docker compose ps donna-web` is healthy.

- [ ] **Step 2: Find the message-send endpoint** the browser POSTs to, so the e2e can assert the skill slug rides in the body. Read `src/lib/chat/chatStream.svelte.ts` (the `runStream` function) to get the exact BFF path it `fetch`es and the body shape (it includes `skills` only when non-empty). Use that path in `page.waitForRequest`.

- [ ] **Step 3: Write `tests/landing-skill-attach.spec.ts`** (self-cleaning). Reuse the login helper + env reading from `tests/matters.spec.ts` / `tests/skills-authoring.spec.ts` (read one for the exact pattern). The test:

1. Log in; go to the landing page (`/`).
2. Open the `⊕ Skill` control (`getByRole('button', { name: /skill/i })` — confirm the exact accessible name by reading `SkillAttach.svelte`); search for and attach a known built-in skill (the autocomplete lists built-ins; pick the first result). Assert the attached **chip** appears in the composer.
3. Type a question in the composer textarea.
4. Set up `const reqP = page.waitForRequest(<send-endpoint-from-step-2>)` BEFORE submitting.
5. Submit (Enter or the send button).
6. `const req = await reqP;` then assert the request `postDataJSON()` (or `postData()`) contains a `skills` array including the attached slug. **This is the core assertion** — it proves the slug threaded landing → cookie → chat load → first send.
7. Assert navigation to `/chats/<uuid>` and that an assistant response renders.
8. Capture the chat id from the URL.
9. `finally`: `await page.request.delete(`${BASE}/api/v1/chats/${chatId}`)`-equivalent — but DELETE must go through the BFF/authed path; if there's no BFF chat-delete route, archive via the API the same way other specs clean up (read `tests/matters.spec.ts` for the cleanup idiom — it deletes projects via an authed request). Guard each cleanup step with `.catch(() => {})`.

Prefer exact-name locators; use `{ exact: true }` where names collide. Prefer SPA assertions over `page.reload()`.

- [ ] **Step 4: Run it against the live stack**

```bash
set -a; . ./.env; set +a
npx playwright test tests/landing-skill-attach.spec.ts
```
Iterate on selectors only until green. Do NOT change app code to make the test pass; if a genuine app bug surfaces, STOP and report it.

- [ ] **Step 5: Full local gate**

```bash
npm run check          # 0 errors / 0 warnings
npx vitest run         # all green (the pre-existing P3 citation *Playwright* specs are separate; vitest itself should be fully green)
```

- [ ] **Step 6: Commit the e2e**

```bash
git add tests/landing-skill-attach.spec.ts
git commit -m "test: live e2e — attach a skill on landing applies it to the first message

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Full-branch review + PR**

Dispatch the two-stage review (spec-compliance then code-quality) over the branch diff vs `origin/main`; name the exact branch `landing-skill-attach` and include a `git rev-parse HEAD origin/landing-skill-attach` step (memory `donna-reviewer-remote-hygiene`). Then push and open a PR into `main` summarizing: the landing skill-attach surface, the one-shot `donna_draft_skills` cookie threading (mirrors `donna_draft`), Skill-only scope (Enhance deferred), and the e2e evidence (the message POST carried the skill slug).

---

## Self-Review (against the spec)

**Spec coverage:**
- §3 Skill-only scope (no Enhance) → Tasks 3 only passes `skillAttach`, never `enhance`. ✓
- §4.1 landing wiring (controller + hidden inputs) → Task 3. ✓
- §4.2 `?/start` sets `donna_draft_skills` → Task 2. ✓
- §4.3 chat `load` reads/deletes/parses → Task 1 (Step 5) + `parseDraftSkills`. ✓
- §4.4 `onMount` threads `draftSkills` → Task 4. ✓
- §5 edges: no-skills (Task 2 second test + `parseDraftSkills` `[]`), malformed cookie (`parseDraftSkills` tests), empty-message (unchanged `onMount` gate on `data.draft`). ✓
- §6 testing: cookie contract unit-tested (T1, T2); wiring + end-to-end via e2e (T5). ✓

**Placeholder scan:** No TBD/TODO. Task 5 leaves selectors/endpoint to be confirmed by reading named files — that's inherent to a live e2e against real DOM, with explicit pointers (`chatStream.svelte.ts`, `SkillAttach.svelte`, `tests/matters.spec.ts`), not a placeholder.

**Type consistency:** `draftSkills: string[]` defined in the load return (Task 1) and consumed as `data.draftSkills ?? []` (Task 4); cookie name `donna_draft_skills` identical across Tasks 1 & 2; `skills` form field name identical in Tasks 2 & 3; `parseDraftSkills` signature stable. ✓
