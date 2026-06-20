# Slice D — Transparency & external-source citations (Donna) — Design Spec

> **Milestone:** Legal research + MCP (the Donna milestone map:
> `docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`).
> **Slice:** D — transparency, gated on lq-ai **PR6 (WS5)**, now landed.
> **Date:** 2026-06-20. **Branch:** `feat/slice-d-transparency` off `main`.
> **Pin:** `vendor/lq-ai` @ **`658fdbc`** (PR6a/b/c/d — #188/#189/#191/#192), bumped as this
> branch's first commit (`docs/decisions/lq-ai-pin.md` top entry).

## Goal

Make the founding-principle question — *"where did this answer's research come from?"* —
answerable right where the user reads it. Two surfaces:

1. **Chat external-source citations (from PR6c).** When a chat turn consults case law via the
   governed tool-loop, surface *which cases it pulled in* under that assistant turn: a provenance
   pill + a collapsible "Sources consulted" panel. Mirrors Donna's existing per-message citations
   path (`CitationView` + the citations lazy-fetch).
2. **Built-in skill tool-usage note (from PR6d).** Make a built-in skill's declared connectors
   visible. `case-law-research` ships `tool_usage: [courtlistener]`. Donna has no built-in skill
   detail page today, so this builds a read-only skill **inspector** that also carries a
   non-blocking "Uses: …" row.

## Backend contract (verified in `src/lib/api/backend.d.ts` after `gen:api` on pin `658fdbc`)

- **PR6c — external-source citations.**
  `GET /api/v1/chats/{chat_id}/messages/{message_id}/sources` → array of source rows. The schema
  is loose (every field optional):
  `{ id?, message_id?, source_kind?, label?, subtitle?, url?, external_ref?, provider?, tool?,
  created_at? }`. `source_kind` is `'caselaw'` in 6c (extensible to `'mcp'` per lq-ai DE-350).
  Retrieval-provenance ("sources consulted"), **not** marker-grounding — distinct from
  `message_citations` (verified quotes). Backed by table `message_tool_sources` (migration 0055,
  verified live). The endpoint returns `[]` (not 404) for turns with no sources; 404 for a
  foreign chat/message. **No new SSE frames** — fetched post-stream, exactly like citations.
- **PR6d — skill tool-usage (C5).** The full `Skill` (detail) schema gains:
  `tool_usage?: string[] | null` (connectors the skill declares it uses) and
  `unavailable_tool_usage?: string[] | null` (declared connectors not configured in this
  deployment; informational, never gating; `null` when undeterminable). These live on `Skill`
  (detail) only — **not** `SkillSummary` (list). Returned by `GET /api/v1/skills/{name}` and
  `GET /api/v1/skills/{name}/contents` (the latter resolves user > team > built-in, D8.1b).
- **PR5a — autonomous tool intents (already shipped + surfaced).** The autonomous receipt's
  `tool_call.tool` is written as `str(intent)` (guard.py), so receipts already render
  `retrieve_caselaw` / `call_mcp_tool`. Donna's `SessionTimeline` already displays them. **No new
  Donna work** for this sub-feature; out of scope for Slice D (see §Non-goals).

lq-ai shipped a complete reference UI for PR6c/6d in their **own** `web/` package
(`ProvenancePill` caselaw kind + `ToolSourcesPanel` + lazy-fetch in `MessageBubble`; `toolUsageNote`
helper + "Uses:" row). It is the design blueprint, not Donna code. Mirror the *shape*; implement
against Donna's actual patterns (`Message.svelte`, `chatStream.svelte.ts`, the BFF proxies).

## Decisions locked in brainstorming (2026-06-20)

1. **Scope = chat citations (PR6c) + built-in skill tool-usage note (PR6d).** Automations-receipt
   intent names already render (PR5a + existing `SessionTimeline`) → not re-built here.
2. **Source rows link externally to CourtListener** (the `url` field), opening in a new tab — matches
   lq-ai's reference UI; simplest; ships now. (In-app doc-panel opening was considered and declined:
   the row carries a *cluster* id in `external_ref`, so in-app reading would need a cluster→opinion
   resolution step — deferred.)
3. **Unconditional post-stream `/sources` fetch.** PR6c adds no SSE signal and sources have no
   in-text marker (unlike citations, which gate on `hasCitationMarkers`). Fetch sources for every
   completed assistant turn; the endpoint returns `[]` cheaply for the common no-tool turn. This
   matches the backend team's own reference UI. (A future SSE `has_tool_sources` echo could optimize
   it — listed as an upstream nicety, not built here.)
4. **The sources pill shows whenever sources exist**, independent of the `provenance_pills` collapse
   setting that gates the verbose applied-skills chips — it is the core transparency affordance of
   this slice.
5. **Built-in skill inspector is read-only** with a "Fork to edit" action reusing the existing fork
   mechanism. The "Uses:" note is **non-blocking and informational** — it never prevents running a
   skill.

## Non-goals (scope guard)

- **No claim-level grounding.** We do not tie a specific sentence to a specific case.
- **No chat-wide aggregation drawer.** Inline per-message panel only.
- **No new SSE frames / streaming-protocol change.** Post-stream fetch only.
- **No autonomous-receipt rebuild.** Intent names already render; per-case source detail in
  autonomous receipts is an upstream enhancement (§Upstream follow-ups), not built here.
- **No `message_citations` changes.** Sources are a separate table/endpoint/surface.
- **No in-app opinion opening from a source row** (cluster→opinion resolution deferred).
- **No generic MCP (`source_kind='mcp'`) handling.** 6c emits only `caselaw`; the parser tolerates
  other kinds but the panel is designed for case-law rows (lq-ai DE-350 will extend later).
- **`SkillSummary` (list) is not changed.** Tool-usage lives on the detail inspector only.

## Part 1 — Chat external-source citations

### Data layer — new `src/lib/citations/sources.ts`

- `ToolSource` interface (hand-typed, since the backend schema is loose per CLAUDE.md §2):
  `{ id: string; message_id: string; source_kind: string; label: string; subtitle: string | null;
  url: string | null; external_ref: string | null; provider: string; tool: string;
  created_at: string | null }`.
- `parseToolSources(raw: unknown): ToolSource[]` — module-local `str`/`obj` guards (mirror
  `src/lib/automations/findings.ts`). Maps each array element; **drops any row missing the
  load-bearing `label`** (returns `null` → filtered). Preserves array order (= retrieval order).
  Non-array input → `[]`. Defaults: `source_kind`/`provider`/`tool` → `''`; nullable fields → `null`.

### BFF proxy — new `src/routes/(app)/chats/[id]/messages/[message_id]/sources/+server.ts`

`GET` handler mirroring the citations proxy
(`src/routes/(app)/chats/[id]/messages/[message_id]/citations/+server.ts`):
`lqFetch(event, /api/v1/chats/{id}/messages/{message_id}/sources)` → on `!ok` throw
`error(404 if 404 else 502, …)`; else `json(await res.json())`. Auth via `lqFetch` (httpOnly cookies
+ transparent refresh). The client treats any failure as "no panel" (tolerant).

### Store — `src/lib/chat/chatStream.svelte.ts`

- Add `sources?: ToolSource[]` to the `ChatMessage` interface.
- Add `loadSources(idx)` mirroring `loadCitations(idx)` **minus** the marker gate: bail if the
  message has no real `id`; `fetch(`/chats/${chatId}/messages/${id}/sources`)`; on non-ok return
  quietly; parse with `parseToolSources`; set `messages[idx].sources` only on success
  (last-known-good — never clobber with a failed/empty parse on a retry path). The same 2-attempt
  persist/fetch-race retry as `loadCitations` (sources persist at turn-end, like citations).
- Call `loadSources(idx)` alongside `loadCitations(idx)` in `consumeStream()` when the turn
  finishes with status `done`.

### UI

- **New `src/lib/components/ToolSourcesPanel.svelte`** — props `{ sources: ToolSource[] }`.
  Presentational (show/hide is owned by `Message.svelte`'s `showSources`). Renders nothing when
  empty. Header `Sources consulted ({n})`; body lists one row per source — `label` (bold),
  `subtitle` (muted, when present), and a CourtListener link
  **only when `url` is present**: `<a href={url} target="_blank" rel="noopener noreferrer">` showing
  plain link text (e.g. "View on CourtListener" or the case name) — never `{@html}`, never the raw
  `url` interpolated into markup beyond the `href`. Match the chrome/spacing of
  `CitationView`/the existing sidecars (Tailwind `mlq-*` tokens).
- **`src/lib/components/Message.svelte`** — on the assistant branch, when
  `message.status === 'done' && message.sources && message.sources.length > 0`:
  - render a pill button in the footer metadata row (beside the existing copy/skills/files chips):
    `⚖ {n} source{n===1?'':'s'} consulted`, `aria`-labelled, toggling a local
    `showSources` `$state`. **Default: panel open** when sources exist (the provenance is small and
    high-value, so show it without a click); the pill toggles it closed/open.
  - render `<ToolSourcesPanel sources={message.sources} />` after the content/`CitationView` block,
    gated on `showSources`.
  - The pill renders **regardless** of the `provenance_pills`/`showPills` collapse setting.
  - Default-safe: existing callers and non-research turns (no `sources`) are visually unchanged.

## Part 2 — Built-in skill tool-usage note (read-only inspector)

### Data layer — `src/lib/skills/`

- Add `Skill` type alias `= components['schemas']['Skill']` (in `src/lib/skills/types.ts` or a small
  `detail.ts`; pick the existing module that fits — `types.ts`).
- `toolUsageNote(skill: Pick<Skill, 'tool_usage' | 'unavailable_tool_usage'>): { text: string;
  unavailable: boolean } | null` — pure helper, 3 states (mirrors lq-ai's `toolUsageNote`):
  - `tool_usage` empty/absent → `null` (no row).
  - `tool_usage` set, `unavailable_tool_usage` empty/null → `{ text: 'Uses: ' + join(tool_usage),
    unavailable: false }`.
  - `unavailable_tool_usage` non-empty → `{ text: 'Uses: ' + join(tool_usage), unavailable: true }`
    (the component renders the amber "… not configured" treatment naming the unavailable
    connectors). Join with `, `.

### Route — new `src/routes/(app)/skills/view/[name]/`

- `+page.server.ts` `load`: `lqFetch(event, /api/v1/skills/{params.name}/contents)`; 404 →
  `error(404, 'Skill not found.')`; `!ok` → `error(502, …)`; else return
  `{ skill: (await res.json()) as Skill }`. (`/contents` resolves user > team > built-in; the
  inspector endpoint.)
- `+page.svelte`: read-only inspector —
  - header: `title`, a scope badge (`scope`), `version`, `author` (when present), `jurisdiction`
    (when present);
  - `description`;
  - **the Uses row** from `toolUsageNote(skill)`: neutral chip when available, amber warning naming
    `unavailable_tool_usage` when not; omitted entirely when the helper returns `null`;
  - `tags` (when present);
  - the rendered body via the existing `Markdown` component on `skill.content_md`;
  - a "Fork to edit" button reusing the existing fork mechanism (the same endpoint/form the
    `/skills` list uses). If reuse is awkward, a plain link back to `/skills` is acceptable — the
    inspector's value is read-only transparency; forking is secondary.

### Link in — `src/routes/(app)/skills/+page.svelte`

Each built-in skill row gains a "View" link → `/skills/view/{name}` (built-in rows currently only
have Fork). User skills keep their existing edit link.

## Honest degradation

- A failed `/sources` fetch → no pill, no panel (turn renders exactly as today). Never breaks the
  message.
- A skill with no `tool_usage` → no Uses row. `unavailable_tool_usage: null` (undeterminable) →
  treated as "available" (no amber), never as an error.
- The inspector degrades each missing optional field independently (no author/jurisdiction/tags →
  those rows simply absent).

## Testing

- **Unit (vitest):**
  - `parseToolSources`: valid rows; rows missing `label` dropped; nullable fields preserved; order
    preserved; non-array → `[]`; malformed elements dropped.
  - `toolUsageNote`: no declaration → null; available; unavailable (amber); `null` unavailable
    treated as available.
  - `loadSources` (store): mocked `fetch` — populates `sources` on 200; quiet on non-ok;
    last-known-good on a failed retry.
  - `+server.ts` sources proxy: mock `lqFetch` — 200 passes JSON through; 404 → 404; other → 502.
  - `skills/view/[name]/+page.server.ts`: mock `lqFetch` — returns `{ skill }`; 404 → 404; 502.
- **Component / `svelte-check`:** 0 errors / 0 warnings. Headless static render of
  `ToolSourcesPanel` (populated + empty), per the established visual-check convention (no
  `@testing-library/svelte`).
- **Live e2e (`tests/`, against the running stack):**
  - Skill inspector: visit `/skills/view/case-law-research`; assert title + "Uses: courtlistener"
    render. Self-cleaning; no seeding needed (built-in skill is present in `/skills`).
  - Chat sources: model-nondeterministic → the e2e **self-skips** if no source rows appear (per the
    Slice C precedent). **Also verify at the API**: drive a chat turn that calls a case-law tool
    (CL wired in dev), then `GET …/sources` returns rows; confirm the pill + panel render via a UI
    screenshot. Document the API-level evidence in the PR.

## Gates (every task + before PR)

`npm run check` 0/0 · `npm run lint` clean · `npx vitest run` green (suite count grows) · rebuild
`donna-web` before any manual/e2e check. Live e2e needs the stack up (CL wired) + the admin fixture.

## Build shape

Subagent-driven TDD, one task per unit, per-task spec+quality review, then whole-branch Opus review,
then PR with a **merge commit**, then mirror `main` + branch to `tucuxi`. Suggested task order:
1. `parseToolSources` + `ToolSource` type (data layer, TDD).
2. Sources BFF proxy (`+server.ts`, TDD).
3. `loadSources` + `ChatMessage.sources` in the store (TDD).
4. `ToolSourcesPanel.svelte` + headless render.
5. `Message.svelte` pill + panel wiring.
6. `Skill` alias + `toolUsageNote` helper (TDD).
7. `/skills/view/[name]` route (`+page.server.ts` TDD + `+page.svelte`).
8. `/skills` list "View" link.
9. Live e2e (`tests/`) + API-level chat-sources verification.

## Upstream follow-ups (relay to LQ-AI CC before PR6e packaging — none block Slice D)

Donna's implementation of PR6's features needs **no new blocking upstream request**; the contracts
are complete in pin `658fdbc`. Relay these enhancements/known-limits so LQ-AI can decide whether to
fold any in before PR6e:

1. **Per-case source detail in *autonomous* receipts** — receipts name the intent + outcome + cost
   but not *which* cases an autonomous `retrieve_caselaw` pulled (the autonomous analog of PR6c's
   chat sources). Nice-to-have enhancement.
2. **Optional chat complete-frame echo** (`has_tool_sources` / `applied_tools`) so Donna can skip
   the unconditional post-stream `/sources` fetch. Minor optimization.
3. Re-flag the known **`oauth_discover` 502 → api 500** papercut for an unregistered OAuth MCP
   client (DE-342 area).
4. Confirm **DE-350** (extend `message_tool_sources` to generic MCP `source_kind='mcp'`) is tracked.

(Still independently upstream-blocked, unchanged: **A2** — in-app CourtListener key —
`docs/upstream-requests/lq-ai-runtime-tool-provider-keys.md`.)

## Acceptance criteria

1. A chat turn that consulted case law renders a `⚖ N sources consulted` pill and a collapsible
   "Sources consulted" panel listing each case (name, court·date when present, a CourtListener link
   when `url` present); turns with no sources are visually unchanged.
2. `parseToolSources` drops malformed/label-less rows and preserves retrieval order; a failed
   `/sources` fetch degrades to no panel.
3. `/skills/view/case-law-research` renders a read-only inspector with the skill body and a
   non-blocking "Uses: courtlistener" row; a built-in skill with an unconfigured connector shows the
   amber "not configured" treatment; a skill with no `tool_usage` shows no Uses row.
4. Built-in skill rows on `/skills` link to the inspector.
5. Gates green: `check` 0/0, `lint` clean, vitest green; e2e (skill inspector live; chat-sources via
   API-level evidence + UI screenshot).
