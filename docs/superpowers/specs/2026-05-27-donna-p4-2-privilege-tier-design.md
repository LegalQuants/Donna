# Donna P4-2 — Privilege & tier-floor (design)

**Date:** 2026-05-27 · **Status:** approved (brainstorm) · **Branch base:** `main` @ `02a22f8` · **Vendor pin:** `vendor/lq-ai` @ `438198c` · **Follows:** P4-1 matters core (#13).

## 1. Goal

Complete the matter create/edit surface to match the LQ_AI new-matter modal: a **privileged** flag and a **minimum inference tier**, with the backend-enforced coupled rule (`privileged=true` requires a tier) surfaced in the form, the reserved P0 privileged visual token used as a reusable chip across matters and chat, and in-chat enforcement that disables sub-floor models in the picker.

Scope (Q1 answer = "full in-chat enforcement"):

- MatterForm gains `privileged` + `minimum_inference_tier`, with coupled validation.
- Reusable `PrivilegedChip` on matter list row, matter detail header, **and** chat header.
- Chat page plumbs the matter's tier floor onto `Composer` → `ModelPicker`, which disables sub-floor options and shows a one-line floor note.

Out of scope: admin tier-policy (deployment-wide floors), context-Markdown editing, attached files / KBs / skills (P4-3), folder tree / file versions / project sharing (upstream-blocked).

## 2. Backend contract (verified 2026-05-27 against `src/lib/api/backend.d.ts`)

- `Project.privileged: boolean` (required), `minimum_inference_tier?: 1|2|3|4|5|null`.
- `ProjectCreate.privileged: boolean` (default `false`), `minimum_inference_tier?: 1|2|3|4|5`.
- `ProjectUpdate.privileged?: boolean`, `minimum_inference_tier?: 1|2|3|4|5|null` (explicit `null` clears).
- Coupled rule (documented in the schema description): `privileged=true` requires `minimum_inference_tier` → **POST returns 422**, **PATCH returns 400** when the merged state would leave the project privileged-but-tierless.
- Effect: every chat in a privileged project is flagged in the audit log; the gateway enforces the tier-floor via the forwarded `lq_ai_project_minimum_inference_tier` header.

**Tier reality** (memory `donna-phase-status`, spiked 2026-05-25): all cloud aliases report `routed_inference_tier = 4`, local aliases report `1`. So as a floor: `1` ⇒ everything allowed, `2`–`4` ⇒ local disabled / cloud allowed, `5` ⇒ everything disabled (degenerate but faithful — see §5).

## 3. Decisions log (from brainstorm Q1–Q4)

| # | Question | Choice | Why |
|---|---|---|---|
| Q1 | Scope of in-chat tier-floor surface | **Full in-chat enforcement** | Disable sub-floor models + privileged chip in chat header; faithful to the gateway-level enforcement. |
| Q2 | Tier-control presentation | **Numeric 1–5 select + helper** | Faithful to backend, matches the LQ_AI modal. Footgun at `5` accepted and surfaced honestly. |
| Q3 | Coupled-validation UX | **Disable submit + inline hint** | Mirrors the existing empty-name disable; server 422/400 stays as a fallback for bypassed clients. |
| Q4 | Privileged visual treatment | **Distinct chip (Lock icon + "Privileged")** | One reusable component across list/detail/chat-header; keeps matter identity and privilege visually separate. |

## 4. Data model & types

- Keep `Matter = components['schemas']['Project']` and `MatterSummary = Pick<Matter, 'id'|'name'>` unchanged. `MatterPicker` continues to take `MatterSummary[]` (picker doesn't need privilege), so the landing path is untouched.
- New `MatterHeaderInfo = { id: string; name: string; privileged: boolean; minimumTier: 1|2|3|4|5|null }` in `src/lib/matters/types.ts`. The chat-header `data.matter` becomes this richer type.
- `resolveMatter` (`src/routes/(app)/chats/[id]/matter.ts`) returns `MatterHeaderInfo | null` (already fetches the full project — just widen the parse and map `minimum_inference_tier` → `minimumTier`).

## 5. `MatterForm.svelte` (create + rename)

New props: `privileged?: boolean = false`, `minimumTier?: 1|2|3|4|5|null = null`. Internally seeded into `$state` via `untrack(() => prop)` (the codebase idiom).

**Layout** (below the existing name + description fields, matching the LQ_AI modal order):

1. A **privileged checkbox** — `<input type="checkbox" name="privileged">`, label "Privileged matter" with helper *"Flags every chat in this matter as privileged in the audit log and enforces a minimum model tier."*
2. A **"Minimum model tier" `<select name="minimum_inference_tier">`** with options: a `None` empty value (default), plus `1`, `2`, `3`, `4`, `5`. Helper *"Higher tiers require cloud models. Privileged matters require a tier."*

**Coupling (Q3):**

- `canSubmit = nameValue.trim() && !(privilegedValue && tierValue === '')`.
- When `privilegedValue && tierValue === ''`, render an inline hint *"Privileged matters require a minimum tier."* The submit button stays disabled (same pattern as the existing empty-name disable).
- Form continues to submit via `use:enhance`; the server 422/400 still flows into the `error` slot as a fallback for the bypassed-client case.

**Form-field wire format:**

- Checkbox → present as `"on"` only when checked, absent otherwise.
- Select → `""` (None) or `"1"`..`"5"`.

## 6. Form actions (server)

Both pages parse the two new fields via a small local helper:

```ts
const privileged = data.get('privileged') === 'on';
const tierRaw = String(data.get('minimum_inference_tier') ?? '');
const minimum_inference_tier =
  tierRaw === '' ? null : (Number(tierRaw) as 1|2|3|4|5);
```

**`create` — `POST /api/v1/projects` (ProjectCreate):**

- Body: `{ name, description, privileged, ...(minimum_inference_tier !== null && { minimum_inference_tier }) }`. `privileged` is always sent (contract requires the boolean; defaults `false`).
- Defense-in-depth pre-check: if `privileged && minimum_inference_tier === null`, `return fail(422, { error: 'Privileged matters require a minimum tier.' })` before calling the backend (catches a bypassed form).
- On non-ok response, map **422** specifically to the privilege message; other failures keep the generic *"Could not create the matter."* Redirect on success as today.

**`rename` — `PATCH /api/v1/projects/{id}` (ProjectUpdate):**

- Body: `{ name, description, privileged, minimum_inference_tier }` — sent as `null` when None (`ProjectUpdate` accepts `null`, so unchecking a tier clears it).
- Same pre-check; map **400** (PATCH's coupled-rule status) → the privilege message. Returns `{ success: true }` as today.

## 7. `PrivilegedChip.svelte`

New `src/lib/matters/PrivilegedChip.svelte` — presentational, optional `size` prop. Renders a filled chip in the privileged token: `bg-mlq-privileged text-white`, a `Lock` icon (`@lucide/svelte`), and the label "Privileged". `aria-label="Privileged matter"`. The token already exists as `--color-mlq-privileged: #7f1d1d` in `src/app.css`'s Tailwind v4 `@theme` block, so `bg-mlq-privileged` is auto-generated.

**Placements** (`{#if matter.privileged}<PrivilegedChip />{/if}`):

1. **Matters list row** (`src/routes/(app)/matters/+page.svelte`) — next to the matter name. The list already has the full `Matter` object.
2. **Matter detail header** (`src/routes/(app)/matters/[id]/+page.svelte`) — next to the `<h1>`.
3. **Chat header** (`src/routes/(app)/chats/[id]/+page.svelte`) — next to `MatterBadge`, driven by `data.matter.privileged` (from the widened `resolveMatter`).

`MatterBadge` itself is unchanged — matter identity stays visually separate from the privilege signal (Q4 choice).

## 8. In-chat tier-floor enforcement

- **`src/lib/components/ModelPicker.svelte`** gains `minimumTier?: 1|2|3|4|5|null = null`. An option is **sub-floor** when `minimumTier != null && opt.tier != null && opt.tier < minimumTier`. Sub-floor options render with `disabled`, `opacity-40`, `cursor-not-allowed`, `aria-disabled="true"`; `choose` is a no-op for them. When a floor is active, a one-line note appears at the top of the dropdown: *"This matter requires tier ≥ N — lower-tier models are unavailable."*
- **`src/lib/components/Composer.svelte`** gains `minimumTier?: 1|2|3|4|5|null` and passes it straight through to `ModelPicker`. The landing path passes nothing (no floor), so it stays inert there.
- **Chat page** reads `data.matter?.minimumTier` and passes it to `Composer`.
- **Stale-selection guard:** the chat page ensures `modelStore.selectedModel` satisfies the floor before first render. If the current selection is sub-floor, it resets to the **highest-tier valid option, preferring `smart`** (cloud, tier 4) — overshooting the floor is the conservative default and converges on `smart` for the realistic tier distribution. The selection logic is extracted as a pure function `pickValidModel(options, currentId, minimumTier)` in `src/lib/models/` so it's unit-testable without the store. The gateway remains the server-side backstop.
- **Degenerate `minimumTier = 5`:** since cloud aliases report tier 4, every alias becomes sub-floor → all options disabled and the floor note shows. This is the faithful consequence of keeping the literal 1–5 select (Q2). Surface it honestly; document it here.

## 9. File-level change map

**New files**

- `src/lib/matters/PrivilegedChip.svelte` — the reusable chip.
- `src/lib/matters/PrivilegedChip.test.ts` — unit test.
- `src/lib/models/pickValidModel.ts` — stale-selection helper.
- `src/lib/models/pickValidModel.test.ts` — unit test.
- `tests/matter-privilege.spec.ts` — live e2e (or extension to the existing matters spec — decide at plan time based on shared seed cost).

**Modified files**

- `src/lib/matters/types.ts` — add `MatterHeaderInfo`.
- `src/lib/matters/MatterForm.svelte` — add privileged + tier fields, coupled validation.
- `src/lib/matters/MatterForm.test.ts` — extend (coupling cases, seed cases).
- `src/routes/(app)/matters/+page.server.ts` — `create` action parses new fields, maps 422.
- `src/routes/(app)/matters/+page.svelte` — render `PrivilegedChip` on list rows.
- `src/routes/(app)/matters/page.server.test.ts` — happy path + pre-check + 422 mapping.
- `src/routes/(app)/matters/[id]/+page.server.ts` — `rename` action parses new fields, maps 400.
- `src/routes/(app)/matters/[id]/+page.svelte` — render `PrivilegedChip`; pass seeded privileged/tier to MatterForm.
- `src/routes/(app)/matters/[id]/page.server.test.ts` — happy path + pre-check + 400 mapping.
- `src/routes/(app)/chats/[id]/matter.ts` — widen `resolveMatter` to return `MatterHeaderInfo`.
- `src/routes/(app)/chats/[id]/matter.test.ts` (if present) — extend; otherwise add minimal coverage.
- `src/routes/(app)/chats/[id]/+page.server.ts` — return widened `matter`.
- `src/routes/(app)/chats/[id]/+page.svelte` — render `PrivilegedChip`; pass `minimumTier` to `Composer`; stale-selection guard on mount.
- `src/lib/components/ModelPicker.svelte` — `minimumTier` prop, disabled rendering, floor note.
- `src/lib/components/ModelPicker.test.ts` — sub-floor disable cases, floor-note rendering, `null`/`5` edges.
- `src/lib/components/Composer.svelte` — thread `minimumTier` prop.

## 10. Testing strategy

**Unit (`npx vitest run`, jsdom + @testing-library/svelte; mock `$app/forms` `enhance`):**

- `MatterForm`: privileged checkbox toggles tier-required state; submit disabled when privileged && no tier; inline hint shown; submit enabled once tier picked; rename seeds privileged/tier from props.
- `PrivilegedChip`: renders label + `aria-label`.
- `ModelPicker`: sub-floor options disabled/non-selectable; valid options selectable; floor note renders only when `minimumTier != null`; `null` leaves all enabled; `5` disables all.
- `pickValidModel`: returns current id when valid; returns `smart` when current is sub-floor and `smart` is valid; falls back to lowest-tier valid option otherwise; returns current id (no-op) when no valid option exists.
- Form-action server tests using the P4-1 mock-`lqFetch` + `URLSearchParams` `Request` pattern:
  - Create: privileged+tier happy path (assert request body), bypassed-client 422 pre-check, backend-422 → privilege-message mapping, non-privileged path unchanged.
  - Rename: same coverage, with 400 mapping for PATCH and `null` tier when None.

**Live e2e (`npx playwright test`, **rebuild `donna-web` first**):** `tests/matter-privilege.spec.ts` — create a privileged matter with a tier floor (unique `Date.now()` name, exact-name locators), assert the privileged chip on list + detail, open a chat in it, assert the chat-header chip + that sub-floor (local) models are disabled in the model picker. **Self-cleaning** (DELETE the seeded matter at end). No RAG/embeddings, so it should not be timing-sensitive.

**Quality bar (the established loop):**

- `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless).
- `npx eslint <touched-files>` clean.
- `npx vitest run` green.
- `npx playwright test` green against the rebuilt container.

## 11. Risks & edges

- **`minimumTier = 5` degenerate state** (all models disabled): faithful to the backend and the Q2 numeric-select choice. The floor note explains why, and the gateway would refuse anyway. Documented; not blocked.
- **Stale model selection** persisted in `modelStore` across chats with different floors: the chat-page guard resets to a valid model on mount. The guard is a pure function and unit-tested.
- **`resolveMatter` widening** changes the chat-page `data.matter` shape — `MatterBadge` still accepts a `MatterSummary` (it only reads `id`/`name`), so a `{...matter}` spread to a `MatterSummary`-typed slot continues to type-check.
- **`MatterPicker` (landing/new-chat) is unchanged** — still takes `MatterSummary[]`. The user has no privilege/tier *picker* at chat-create time; they pick the matter, and the matter's settings flow with it (see §8 stale-selection guard).
- **PATCH coupled-rule with merged state:** unchecking `privileged` while leaving a tier set is allowed (the rule is `privileged ⇒ tier`, not the reverse). Unchecking tier on an already-privileged matter without also unchecking `privileged` would 400 — the form's client-side disable prevents this, and the server-side mapping catches the bypass.
- **No backend changes needed** — the contract already supports everything (verified §2).

## 12. Out-of-scope follow-ups (do not slip into this slice)

- Admin `tier-policy` (deployment-wide floors).
- Editing `Project.context_md` (matter context Markdown) — P4-3 territory.
- Attached files / KBs / skills on matters — P4-3.
- Folder tree / file versions / project sharing — upstream-blocked.
- Plain-language tier labels (revisit only if the backend's tier semantics change so 1–5 become meaningfully differentiated).
