# Applied-Skills Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a quiet footer line on each assistant turn confirming which skills the backend applied, for both streamed and reloaded turns — plus an upstream request that makes `skill_inputs` meaningful for the corpus (unblocking the deferred composer input form).

**Architecture:** `applied_skills` (a `string[]` of slugs) already rides on every SSE `delta` frame and on history message rows. We capture it onto the assistant `ChatMessage` (mirroring the existing `routed_inference_tier`/`anonymized` per-turn metadata), prettify each slug to a friendly title with a pure helper, and render a small linked footer line in `Message.svelte`. No new BFF endpoint, no backend change for the shippable half.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide (`@lucide/svelte`).

**Spec:** `docs/superpowers/specs/2026-05-29-donna-skill-inputs-applied-confirmation-design.md`

**Conventions:** TDD (test first, watch it fail, minimal impl, watch it pass, commit). Commit per task and push regularly. Quality bar: `npm run check` = 0 errors and 0 warnings (a vendor `ERR_MODULE_NOT_FOUND` stderr line from the lq-ai submodule is harmless — the signal is exit 0 + the "0 errors and 0 warnings" line). eslint clean on touched files; no `any`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/skills/skillLabel.ts` | Create | Pure `prettifySkillSlug(slug)` → friendly title |
| `src/lib/skills/skillLabel.test.ts` | Create | Unit tests for the helper |
| `src/lib/chat/sse.ts` | Modify | Add `applied_skills?` to the `complete` frame's `message` |
| `src/lib/chat/chatStream.svelte.ts` | Modify | `ChatMessage.applied_skills` field; capture in `applyFrame`; clear in `retry` |
| `src/lib/chat/chatStream.svelte.test.ts` | Modify | Tests: delta capture, complete capture, retry clears |
| `src/lib/components/Message.svelte` | Modify | Render the quiet linked footer confirmation |
| `src/lib/components/Message.svelte.test.ts` | Modify | Tests: footer renders / absent-when-empty |
| `src/routes/(app)/chats/[id]/+page.server.ts` | Modify | Pass `applied_skills` through the history map |
| `docs/upstream-requests/lq-ai-skill-inputs-corpus.md` | Create | Upstream request (second deliverable) |
| `tests/applied-skills.spec.ts` | Create | Live e2e (attach → send → footer → persists) |

---

## Task 1: `prettifySkillSlug` helper

**Files:**
- Create: `src/lib/skills/skillLabel.ts`
- Test: `src/lib/skills/skillLabel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/skills/skillLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prettifySkillSlug } from './skillLabel';

describe('prettifySkillSlug', () => {
  it('title-cases a simple slug', () => {
    expect(prettifySkillSlug('comms-improver')).toBe('Comms Improver');
  });
  it('upper-cases known acronyms', () => {
    expect(prettifySkillSlug('contract-qa')).toBe('Contract QA');
    expect(prettifySkillSlug('nda-review')).toBe('NDA Review');
    expect(prettifySkillSlug('dpa-checklist-review')).toBe('DPA Checklist Review');
  });
  it('handles a multi-acronym slug with mixed-case display form', () => {
    expect(prettifySkillSlug('msa-review-saas')).toBe('MSA Review SaaS');
  });
  it('handles a single word with no hyphen', () => {
    expect(prettifySkillSlug('enhance')).toBe('Enhance');
  });
  it('returns empty string for empty input', () => {
    expect(prettifySkillSlug('')).toBe('');
  });
  it('collapses empty segments from stray dashes', () => {
    expect(prettifySkillSlug('nda--review-')).toBe('NDA Review');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/skillLabel.test.ts`
Expected: FAIL — `Failed to resolve import './skillLabel'` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/skills/skillLabel.ts`:

```ts
/**
 * Friendly display title for a skill slug, for the applied-skills confirmation.
 * `contract-qa` → "Contract QA", `msa-review-saas` → "MSA Review SaaS".
 *
 * Pure and deterministic (no fetch): known acronyms get canonical casing,
 * every other word is title-cased. This is the loose inverse of
 * `deriveSlug` (authoring/deriveSlug.ts) — it won't always reproduce a
 * skill's exact backend display_name (e.g. parenthesised forms), but stays
 * close and plain-language, which suits a low-stakes footer label.
 */
const ACRONYMS: Record<string, string> = {
  msa: 'MSA',
  nda: 'NDA',
  dpa: 'DPA',
  qa: 'QA',
  saas: 'SaaS',
  sow: 'SOW',
  baa: 'BAA',
  gdpr: 'GDPR'
};

export function prettifySkillSlug(slug: string): string {
  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/skillLabel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/skillLabel.ts src/lib/skills/skillLabel.test.ts
git commit -m "feat(applied-skills): prettifySkillSlug helper"
```

---

## Task 2: Capture `applied_skills` on the assistant message

**Files:**
- Modify: `src/lib/chat/sse.ts` (the `complete` frame type, ~lines 10-17)
- Modify: `src/lib/chat/chatStream.svelte.ts` (`ChatMessage` ~line 7-20; `applyFrame` ~line 33-49; `retry` ~line 173-184)
- Test: `src/lib/chat/chatStream.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these three tests inside the `describe('createChatStream', ...)` block in `src/lib/chat/chatStream.svelte.test.ts` (before its closing `});`):

```ts
  it('captures applied_skills from delta frames', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"delta","delta":"hi","lq_ai_message_id":"a1","applied_skills":["comms-improver"]}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))); // loadAnonymization GET
    const chat = createChatStream('c1');
    await chat.send('hello', 'smart', ['comms-improver']);
    expect(chat.messages[1].applied_skills).toEqual(['comms-improver']);
  });

  it('captures applied_skills from the complete frame message', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi","applied_skills":["nda-review"]}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })));
    const chat = createChatStream('c1');
    await chat.send('hello', 'smart', ['nda-review']);
    expect(chat.messages[1].applied_skills).toEqual(['nda-review']);
  });

  it('clears applied_skills on retry before re-streaming', async () => {
    const withSkill = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"delta","delta":"x","lq_ai_message_id":"a1","applied_skills":["comms-improver"]}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"x"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const noSkill = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"y"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(withSkill())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(noSkill())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })));
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['comms-improver']);
    expect(chat.messages[1].applied_skills).toEqual(['comms-improver']);
    await chat.retry();
    expect(chat.messages[1].applied_skills).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: the three new tests FAIL — `applied_skills` is `undefined` (not captured) and not cleared on retry.

- [ ] **Step 3: Implement — add the field, capture it, clear it on retry**

In `src/lib/chat/sse.ts`, extend the `complete` frame's `message` shape to carry `applied_skills` (it currently lists `id`, `content`, `routed_inference_tier`, `routed_provider`):

```ts
  | {
      type: 'complete';
      lq_ai_message_id: string;
      message: { id: string; content: string; routed_inference_tier?: number | null; routed_provider?: string | null; applied_skills?: string[] };
      /** Deprecated: empty under M2-A2; citations come from the per-message endpoint. */
      citations?: unknown[];
      routed_inference_tier?: number | null;
    }
```

In `src/lib/chat/chatStream.svelte.ts`, add the field to `ChatMessage` (after `anonymized?: boolean;`):

```ts
  anonymized?: boolean;
  /** Slugs of the skills the backend reported as applied to this assistant turn. */
  applied_skills?: string[];
```

In the same file, in `applyFrame`, capture it on both the `delta` and `complete` branches:

```ts
    } else if (frame.type === 'delta') {
      m.content += frame.delta;
      if (frame.routed_inference_tier != null) m.routed_inference_tier = frame.routed_inference_tier;
      if (frame.applied_skills) m.applied_skills = frame.applied_skills;
    } else if (frame.type === 'complete') {
      m.id = frame.message.id ?? m.id;
      m.content = frame.message.content ?? m.content;
      const tier = frame.message.routed_inference_tier ?? frame.routed_inference_tier;
      if (tier != null) m.routed_inference_tier = tier;
      if (frame.message.applied_skills) m.applied_skills = frame.message.applied_skills;
      m.status = 'done';
    } else if (frame.type === 'error') {
```

In the same file, in `retry`, clear it alongside the other per-turn fields (after the `anonymized` reset):

```ts
    messages[idx].anonymized = undefined;
    messages[idx].applied_skills = undefined;
    messages[idx].status = 'streaming';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS (all tests, including the three new ones and the existing retry/citation/anonymized cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/sse.ts src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(applied-skills): capture applied_skills on the assistant message"
```

---

## Task 3: Render the footer confirmation in `Message.svelte`

**Files:**
- Modify: `src/lib/components/Message.svelte` (import + the `status === 'done'` footer block, ~lines 1-6 and 55-59)
- Test: `src/lib/components/Message.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these two tests inside the `describe('Message', ...)` block in `src/lib/components/Message.svelte.test.ts` (before its closing `});`):

```ts
  it('shows the applied-skills footer with prettified, linked names', () => {
    const { getByText, getByRole } = render(Message, {
      props: { message: { key: 'a7', id: 'a7', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_skills: ['comms-improver', 'nda-review'] } }
    });
    expect(getByText(/Applied:/)).toBeInTheDocument();
    const link = getByRole('link', { name: 'Comms Improver' });
    expect(link).toHaveAttribute('href', '/skills');
    expect(getByRole('link', { name: 'NDA Review' })).toHaveAttribute('href', '/skills');
  });

  it('renders no applied-skills footer when none were applied', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'a8', id: 'a8', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4 } }
    });
    expect(queryByText(/Applied:/)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: the first new test FAILS — no "Applied:" text / no link rendered. (The second passes trivially even before the change; it locks in the absent-when-empty behaviour.)

- [ ] **Step 3: Implement the footer**

In `src/lib/components/Message.svelte`, add `ScrollText` to the lucide import and import the helper (top `<script>` block):

```svelte
  import { ShieldCheck, ScrollText } from '@lucide/svelte';
  import { prettifySkillSlug } from '$lib/skills/skillLabel';
```

Then replace the existing `status === 'done'` footer block:

```svelte
      {#if message.status === 'done'}
        <div class="mt-2 text-xs text-mlq-muted">
          <button type="button" onclick={copy} class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5">{copied ? '✓ copied' : '⧉ Copy'}</button>
        </div>
      {/if}
```

with this (Copy button + the applied-skills line on the same quiet footer row):

```svelte
      {#if message.status === 'done'}
        <div class="mt-2 flex items-center gap-2 text-xs text-mlq-muted">
          <button type="button" onclick={copy} class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5">{copied ? '✓ copied' : '⧉ Copy'}</button>
          {#if message.applied_skills && message.applied_skills.length > 0}
            {@const skills = message.applied_skills}
            <span class="inline-flex items-center gap-1">
              <ScrollText size={11} aria-hidden="true" />
              <span>Applied:</span>
              {#each skills as slug, i (slug)}<a href="/skills" class="hover:underline">{prettifySkillSlug(slug)}</a>{#if i < skills.length - 1}<span aria-hidden="true">,&nbsp;</span>{/if}{/each}
            </span>
          {/if}
        </div>
      {/if}
```

(The `{@const skills = message.applied_skills}` binding gives Svelte/TS a non-nullable reference inside the block — avoids a `state_referenced_locally`-style narrowing warning against the 0-warnings bar.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(applied-skills): render the footer confirmation on assistant turns"
```

---

## Task 4: Pass `applied_skills` through the history load

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts` (the `page.items.map(...)` at ~line 23)

This is a one-field passthrough so reloaded chats show the confirmation. It has no dedicated unit test (the `load` function would require mocking `lqFetch` + `resolveMatter` + `parseDraftSkills` + the receipts/citations fetches — disproportionate for a field passthrough); it is covered end-to-end by the reload assertion in the Task 6 live e2e.

- [ ] **Step 1: Add the field to the history map**

In `src/routes/(app)/chats/[id]/+page.server.ts`, in the `const messages: ChatMessage[] = page.items.map((m) => ({ ... }))` object, add `applied_skills` (the row carries it — verified live):

```ts
  const messages: ChatMessage[] = page.items.map((m) => ({
    key: m.id, // history rows have stable backend ids — safe as the list key
    id: m.id,
    role: m.role,
    content: m.content,
    routed_inference_tier: m.routed_inference_tier,
    applied_skills: m.applied_skills,
    status: 'done'
  }));
```

- [ ] **Step 2: Type-check passes**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings" (`m.applied_skills` is valid now that Task 2 added it to `ChatMessage`; `page.items` is typed `ChatMessage[]`). A vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat(applied-skills): surface applied_skills on reloaded history turns"
```

---

## Task 5: Upstream request — make `skill_inputs` meaningful for the corpus

**Files:**
- Create: `docs/upstream-requests/lq-ai-skill-inputs-corpus.md`

This is the second deliverable: it documents the verified blocker and proposes the fix so the deferred composer input form becomes worthwhile. No code/test; it's handed to the user to relay to the lq-ai Claude Code session.

- [ ] **Step 1: Write the upstream request document**

Create `docs/upstream-requests/lq-ai-skill-inputs-corpus.md` with this content:

````markdown
# Upstream request — make `skill_inputs` reach the model for non-templated skills

**To:** lq-ai backend session · **From:** Donna · **Date:** 2026-05-29 · **Pin observed:** `438198c`

## Summary

`MessageCreate.skill_inputs` is accepted, anonymized, and forwarded to the gateway as `lq_ai_skill_inputs`, but the collected values **never reach the model for any current built-in skill**. The gateway assembler only substitutes `{{placeholder}}` tokens in a skill body and silently drops any bound input the body doesn't reference. None of the 14 built-in skills use `{{}}` placeholders, so a UI that collects a skill's declared inputs (jurisdiction, perspective, audience, …) produces values that vanish. This blocks Donna from shipping a skill-input form with real payoff.

## Evidence (verified live at `438198c`)

- `gateway/app/skills/assembler.py` → `interpolate(template, bindings)` substitutes only `{{name}}`; its docstring notes "surplus inputs the body never references are tolerated" — i.e. dropped. `assemble_skill_prompt` calls `_render_skill(skill, inputs=bindings)` which interpolates `content_md` and reference files, nothing more.
- `grep -rl '{{' skills/*/SKILL.md` → no matches. No built-in body is templated.
- Repro: attach `comms-improver` (declares required `text` + `audience`) and POST a message with `skill_inputs: {"comms-improver": {"text": "...", "audience": "a 10-year-old"}}`. The model replies "I don't see any text to rewrite" — the bound inputs were dropped. A user-skill whose body contains `{{topic}}`/`{{style}}` *does* interpolate correctly, confirming the mechanism works only for templated bodies.
- `extract_required_inputs` re-parses frontmatter for required-input names, but missing required inputs are **not enforced** for built-ins in practice: posting `contract-qa` with no `skill_inputs` returns `200` (the model asks conversationally) rather than raising `SkillInputMissing`.

## Proposed fix

**Option A (recommended) — append unreferenced bound inputs as a labelled context block.**
After interpolation in `_render_skill` / `assemble_skill_prompt`, for each skill take the bound inputs that were *not* consumed by a `{{placeholder}}` and append them to the assembled skill prompt as a short labelled block, e.g.:

```
### Provided inputs for {skill_name}
- {input_name}: {value}
```

This makes every skill — templated or not — benefit from collected inputs, with no corpus edits. Backward compatible (skills that template their bodies are unaffected; the block only carries the leftovers). Smallest blast radius.

**Option B — template the built-in corpus.**
Add `{{}}` placeholders to each built-in `SKILL.md` body matching its declared inputs. Higher-fidelity prompts but touches every skill file and must stay in sync with the frontmatter `inputs` block.

A combination is reasonable: ship Option A as the safety net now, adopt Option B opportunistically per skill.

## Suggested test

In `gateway/tests/test_inference_skill_assembly.py` (or sibling): assemble a **non-templated** skill with bound inputs and assert the assembled prompt contains the input name and value (Option A), so collected inputs are provably visible to the model without requiring `{{placeholders}}`.

## Relay / pin-bump workflow

Per `donna-phase-status` memory: relay this to the lq-ai session; when merged, report the SHA so Donna bumps the submodule pin, runs `npm run gen:api`, rebuilds, verifies live, and logs the bump in `docs/decisions/lq-ai-pin.md`. Then build the deferred Donna composer skill-input form against the now-meaningful contract.
````

- [ ] **Step 2: Commit**

```bash
git add docs/upstream-requests/lq-ai-skill-inputs-corpus.md
git commit -m "docs(upstream): request to make skill_inputs reach non-templated skills"
```

---

## Task 6: Live end-to-end test

**Files:**
- Create: `tests/applied-skills.spec.ts`

Mirrors `tests/skill-attach.spec.ts` (login → landing composer → start chat → attach skill → send). No chat teardown — matching the `skill-attach.spec.ts` precedent (there is no chat-delete BFF route; chat rows are bounded and harmless on the shared admin account).

- [ ] **Step 1: Rebuild `donna-web` so the container serves the new code**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```
Expected: `donna-web` recreated and healthy. (The container serves a built image, not live `src/` — this is REQUIRED before any live e2e or the test runs against stale code.)

- [ ] **Step 2: Write the e2e test**

Create `tests/applied-skills.spec.ts`:

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

test('applied-skills confirmation appears on the assistant turn and persists across navigation', async ({ page }) => {
  await login(page);

  // Start a chat from the landing composer (first turn has no skill attached).
  await page.fill('textarea', 'In one short sentence, what is plain-language legal writing?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  const chatUrl = page.url();
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

  // Attach comms-improver in the in-chat composer.
  await page.getByTestId('skill-attach').click();
  await page.getByTestId('skill-search').fill('comms');
  await expect(page.getByTestId('skill-result-comms-improver')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('skill-result-comms-improver').click();

  // Send a second message that applies the skill.
  await page.fill('textarea', 'Rewrite this for a 10-year-old: pursuant to the foregoing.');
  await page.keyboard.press('Enter');

  // The new assistant turn shows the applied-skills confirmation: a link named
  // "Comms Improver" pointing at /skills, next to an "Applied:" label.
  const appliedLink = page.getByRole('link', { name: 'Comms Improver' });
  await expect(appliedLink).toBeVisible({ timeout: 30000 });
  await expect(appliedLink).toHaveAttribute('href', '/skills');
  await expect(page.getByText('Applied:').last()).toBeVisible();

  // Persists from history: a fresh server-side load of the same chat (full
  // navigation, not page.reload() — avoids the SvelteKit-2/Svelte-5 stale-data
  // reload quirk) still renders the confirmation.
  await page.goto('/');
  await page.goto(chatUrl);
  await expect(page.getByRole('link', { name: 'Comms Improver' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Comms Improver' })).toHaveAttribute('href', '/skills');
});
```

- [ ] **Step 3: Run the e2e against the running stack**

Run: `npx playwright test tests/applied-skills.spec.ts`
Expected: PASS — the confirmation appears after the skill-applied send and survives the re-navigation.

- [ ] **Step 4: Full verification gate**

Run: `npm run check && npx vitest run`
Expected: `npm run check` exit 0 with "0 errors and 0 warnings" (vendor `ERR_MODULE_NOT_FOUND` stderr harmless); all vitest suites green.

- [ ] **Step 5: Commit**

```bash
git add tests/applied-skills.spec.ts
git commit -m "test(applied-skills): live e2e — confirmation appears and persists"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** §4 data flow → Tasks 2 + 4; §5 prettify → Task 1; §6 rendering → Task 3; §7 upstream → Task 5; §8 tests → unit tests in Tasks 1-3 + live e2e in Task 6. History-map unit test deliberately omitted (disproportionate mocking) and covered by the e2e reload — noted in Task 4.
- **Type consistency:** `applied_skills?: string[]` is the single name used across `ChatMessage`, the `sse.ts` complete frame, `applyFrame`, the history map, and `Message.svelte`. `prettifySkillSlug` is the one helper name throughout.
- **No placeholders:** every code/command step is concrete.
