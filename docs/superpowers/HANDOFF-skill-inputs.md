# Donna — Handoff for the next session (build: skill-inputs application)

**Date:** 2026-05-29 · **Next slice:** **Skill inputs** — collect a skill's declared inputs in the composer and thread `MessageCreate.skill_inputs`; surface `applied_skills`.

> **First thing:** read project memory (`MEMORY.md` index — esp. `donna-phase-status`, `donna-product-direction`, `donna-workflow`, `donna-dev-stack`, `donna-reviewer-remote-hygiene`). Then this handoff. The recommended slice is scoped in §6; **confirm scope with the user at the brainstorm step before writing the spec.**

## 1. Branch state — MERGE THESE FIRST

`main` HEAD is `f54e356` (the #20 docs merge). **Three things are open and should land before (or be coordinated with) this slice:**

| PR / branch | What | Action |
|---|---|---|
| **#21** `p5-1-skills-authoring` | Skills authoring (`/skills` create/edit/fork/archive) + **built-in catalog** | Review + merge to `main` |
| **#22** `landing-skill-attach` | `⊕ Skill` on the **landing** composer (apply a skill to the first message) | Review + merge to `main` |
| `docs/upstream-chat-file-attach` (pushed, may need a PR) | Upstream request: `docs/upstream-requests/lq-ai-chat-message-file-attach.md` | **Relay to the lq-ai Claude Code session**; bump the pin when it merges |

**Start the skill-inputs slice off an up-to-date `main` that includes #21 + #22.** The slice extends the in-chat skill-attach surface (P2c-B2, already on `main`) and is adjacent to #22; building before those merge risks conflicts in `Composer.svelte` / the chat page. `vendor/lq-ai` pin is **`438198c`** (unchanged; this slice needs **no backend change**).

## 2. What Donna is

Standalone MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. Browser talks only to Donna's SvelteKit server (a **BFF**) which holds the lq-ai JWT in httpOnly cookies and proxies to the lq-ai `api`. Visual language: document-forward, serif, restrained grays. **Product thesis (`donna-product-direction`):** expose the backend's power through a **friendly, minimal-chrome, plain-language UX** — the opposite of the LQ_AI developer frontend.

## 3. Why this slice — "apply skills properly"

Skill *application* already works: attaching a skill in the composer threads `MessageCreate.skills` (slugs) → the gateway assembles each skill into the prompt. After #22 you can do this from the first message too. **But two gaps remain (verified 2026-05-29):**

1. **Skill inputs are never collected.** Many skills declare **inputs** (a form schema) the model should be given — e.g. a jurisdiction, a counterparty name, a target document. The contract supports binding them (`MessageCreate.skill_inputs`) and fetching the schema (`GET /api/v1/skills/{slug}/inputs`), but **`skill_inputs` is referenced NOWHERE in app code** (only in the generated `backend.d.ts` / `gateway.d.ts`). So a skill that needs inputs runs without them.
2. **No "applied" confirmation.** The streamed response / message carries `applied_skills`, surfaced in `src/lib/chat/sse.ts` as a field but **rendered by no component** — the user gets no feedback about which skills actually ran.

This is the bridge to **playbooks** (a playbook = chain skills + collect their inputs + pick documents → run), so build it first.

## 4. Backend contract (verified 2026-05-29 at pin `438198c`)

| Surface | Endpoint / schema | Notes |
|---|---|---|
| Declared inputs for a skill | `GET /api/v1/skills/{skill_name}/inputs` → `SkillInputs` | `{ name, required: SkillInputDef[], optional: SkillInputDef[] }`. Returns a **name-only stub** (empty `required`/`optional`) when the skill declares no inputs. `{skill_name}` = the slug (`SkillSummary.name`). |
| One input's schema | `SkillInputDef` | `{ name: string; type?: string\|null; required: boolean; description?: string\|null; enum?: string[]\|null; default?: unknown }`. `type` is **free-form** per the corpus: `text`, `enum`, `boolean`, `integer`, `structured`, `file`, … |
| Send bindings on a message | `MessageCreate.skill_inputs?` | `{ [skillName: string]: { [inputName: string]: unknown } }` — per-skill map of input-name → value. Sent alongside `skills: string[]`. |
| Applied confirmation | `applied_skills` on the SSE complete frame + the message row | Already in `src/lib/chat/sse.ts`; not rendered anywhere yet. |

`backend.d.ts`: `SkillInputs` and `SkillInputDef` are defined near lines 7858–7872; `MessageCreate.skill_inputs` is in the `MessageCreate` schema (~7671).

## 5. Where it plugs in (current code)

- **Composer skill-attach** lives in `src/lib/skills/` — `attach.svelte.ts` (`createSkillAttach`: `attached`/`names`/`attach`/`remove`, fetches `/skills/autocomplete`), `SkillAttach.svelte` (the `⊕ Skill` popover; `data-testid="skill-attach"` / `skill-search` / `skill-result-{slug}`), `types.ts` (`AttachedSkill = { slug, title }`).
- **Send path:** `src/lib/chat/chatStream.svelte.ts` → `send(content, model, skills)` → `runStream` builds the body `{ content, model, skills? }` and POSTs `/chats/{chatId}/messages`. **This is where `skill_inputs` must be added to the body** (only when non-empty), and `createSkillAttach` (or a new sibling controller) must hold the per-skill input values.
- **Composer:** `src/lib/components/Composer.svelte` renders the `⊕ Skill` control + attached chips `{#if skillAttach}`; its `onsubmit(text, model, skills)` is called by the in-chat page (`src/routes/(app)/chats/[id]/+page.svelte`) and (post-#22) the landing page threads skills via the `donna_draft_skills` cookie.
- **A BFF proxy for the inputs schema** will likely be needed (the popover fetches client-side, like `/skills/autocomplete`): add `src/routes/(app)/skills/[slug]/inputs/+server.ts` (GET → `lqFetch('/api/v1/skills/{slug}/inputs')`) — mirror `src/routes/(app)/skills/autocomplete/+server.ts` (503/504 passthrough else 502).
- **Applied confirmation:** `src/lib/chat/sse.ts` already parses `applied_skills`; surface it on the assistant message (e.g. a small "Applied: contract-qa" line in `Message.svelte`).

## 6. Recommended slice scope (confirm at brainstorm)

**Skill-inputs application (in-chat first):**
- When a skill is attached, fetch its inputs schema. If it declares inputs, expose a small **input form** (per attached skill) so the user can fill required + optional values before sending.
- Thread the collected values into `MessageCreate.skill_inputs[skillName] = { … }` in `chatStream.runStream` (only when non-empty).
- **Widget by `type`:** `text`→input, `enum`→select (use `enum[]`), `boolean`→checkbox, `integer`→number; `default` pre-fills; `required` gates send (disable until required inputs filled, like the create-skill modal's `canCreate`). `description` as helper text.
- **`type: 'file'` inputs are BLOCKED** — they'd need `file_id`s, which require the upstream chat-file-attach change (`docs/upstream-requests/lq-ai-chat-message-file-attach.md`). For this slice, surface file-type inputs as **disabled with an explanatory note** (don't silently drop them) and defer real file binding until the upstream lands.
- **Applied-skills confirmation:** render `applied_skills` on the assistant turn (small, friendly).

**Open scope questions for the brainstorm:**
- **Where does the input form live?** Inline under the composer (expands when an attached skill has inputs) vs a small popover/drawer per chip vs a modal on send. The product thesis leans inline + minimal.
- **Required-input gating:** block send until required inputs are filled (recommended) vs send-anyway with a warning.
- **Landing parity:** do inputs need to work from the landing composer too (post-#22)? That means threading `skill_inputs` through the `donna_draft_skills` cookie mechanism as well — likely a follow-up, not this slice. **Default: in-chat only for v1.**
- **Multiple attached skills with inputs:** one combined form vs per-skill sections. Per-skill keyed by slug matches the `skill_inputs` shape.
- **Spike the live shape early:** pick a built-in that actually declares inputs (e.g. inspect a few via `GET /skills/{slug}/inputs` against the running stack) so the form is designed against real `type` values — the corpus `type` strings are free-form.

## 7. How to build a slice (the established loop)

Per slice, one PR into `main`: **brainstorm** (confirm scope; spike the live `inputs` contract early) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks, complete code per step) → **subagent-driven-development** (fresh implementer per task + two-stage review: spec-compliance then code-quality; controller verifies each finding; commit per task) → **live e2e** against the running stack → **finishing-a-development-branch** (PR). Quality bar: `npm run check` = **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; signal = exit 0 + the "0 errors and 0 warnings" line). eslint clean on touched files (no `any`). **Rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web` — the container serves a built image, not live `src/`).

## 8. Running / verifying the stack

Compose project `donna` on shifted ports (app **http://localhost:13002**, lq-ai api `127.0.0.1:18000`). `.env` is gitignored but present (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DONNA_BASE_URL`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`).

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web   # after editing src/ (REQUIRED before live e2e)
npm run check && npx vitest run && npx playwright test
```
**Spike helper** (inspect a skill's declared inputs against the live backend) — log in for a token, then `GET /api/v1/skills/{slug}/inputs`. The admin account is shared; **self-clean any e2e-created chats/skills by captured id** in `try/finally` (the P5-1 / landing-skill-attach specs are the pattern — see §9).

## 9. Gotchas (carried forward)

- **Self-contained modals/popovers:** a control toggled by an `open` prop stays mounted; own your error/state and **reset on open** — do NOT read the page-wide `form` prop for inline errors (it persists across open/close → ghost errors). Drive errors from the control's own `use:enhance` failure result. (P5-1 `CreateSkillModal` learned this the hard way.)
- **Plain `use:enhance` invalidates on success** (`@sveltejs/kit` `forms.js`: `result.type === 'success'` → `invalidateAll()`), so a page's `load` re-runs and `$state` seeded once via `untrack` survives a save without remount. Use plain `use:enhance` when the page owns `$state` that must persist.
- **`getByRole(role, { name })`** matches the accessible name **exactly** by default; **`exact` is NOT a valid `ByRoleOptions` key** in this repo's Testing-Library version (it's a type error → breaks the 0-errors bar). Use a string `name` (exact by default); use `{ name: 'X', exact: true }` only on `getByText`-family / Playwright locators.
- **Enhance-failure unit testing:** mock `$app/forms` `enhance` with a `vi.hoisted` capture of the submit fn so a test can drive a `{ type: 'failure', data }` result (see `CreateSkillModal.svelte.test.ts` from #21).
- **Live-e2e:** rebuild `donna-web` first; prefer SPA nav over `page.reload()` (SvelteKit-2/Svelte-5 stale-`data` quirk after reload); clean up by **captured id**, not by name (forks share a built-in's display name). Use a unique slug/name per run (`Date.now()`).
- **Route param `{skill_name}` is the slug**; `user-skills/{skill_id}` is a UUID; slug is immutable after create; `DELETE /user-skills/{id}` → **410** when already archived (not 409). (#21 corrections.)
- **Pre-existing P3 Playwright debt** (`tests/citation-pills.spec.ts`, `tests/citation-live.spec.ts`) is red on `main` — out of scope; don't let it block, don't "fix" it here.

## 10. Capability backlog after this slice (`donna-product-direction`)

- **Playbooks** (P5-2/P5-3) — chain skills + collect inputs + pick documents → run (`POST /api/v1/playbooks/easy` per the M3-A6 docstring; spike before scoping — backend reality may differ). Built on this slice's input-collection machinery.
- **Chat-level file upload** — UPSTREAM-BLOCKED; the request is written (`docs/upstream-requests/lq-ai-chat-message-file-attach.md`). When it lands, `type: 'file'` skill inputs and a composer drop-zone both unlock.
- **Applied-skills / receipts depth, redline (P8), tabular (P6), settings/trust (P7)** — later phases.

## 11. Minimum cold-start for the next session

1. `git checkout main && git pull` → confirm #21 + #22 are merged (HEAD ≥ both merges). If not merged, coordinate with the user first.
2. `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
3. Read `MEMORY.md` + this handoff.
4. `docker compose ps` (stack should be up); `docker compose up -d --build donna-web` before any live e2e.
5. **Spike** a real skill's `GET /skills/{slug}/inputs` to see the live `type` values, then **brainstorm** the slice with the user (§6) before writing the spec.
