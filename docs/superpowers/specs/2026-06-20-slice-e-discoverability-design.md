# Slice E — Discoverability & in-app guidance ("dead simple") — Design Spec

> **Milestone:** Legal research + MCP (the Donna milestone map). **Slice:** E — wrap-up, part 1
> (in-app discoverability/guidance). **Date:** 2026-06-20. **Branch:** `feat/slice-e-discoverability`
> off `main` (pin `658fdbc`, post-#89 merge).

## Problem

The legal-research + MCP milestone (Slices A–D) shipped real capability — Research/CourtListener,
MCP tools, per-user Connections, the governed chat tool-loop, and external-source provenance — but
**none of it is explained anywhere in the app.** The `/about` guide has zero coverage, and every new
surface either sits unlabeled in nav or only appears mid-interaction with no plain-language
explanation. A user "doesn't know where or how to use it."

## Goal

Make each new feature understandable **at the moment of encounter**, in plain language, with
clickable starting points — and give `/about` the depth for those who want it. Bar: **dead simple and
very clear to a non-technical legal user.**

## Decisions locked in brainstorming (2026-06-20)

1. **Both, in-context first.** In-context help on each surface is the priority; new `/about` pages are
   the reference.
2. **Explain + clickable starters.** Plain-language "what this is / how to use it", plus clickable
   example case-law searches (Research) and an example case-law chat prompt (Assistant composer).
3. **No new playground.** The heavier LQ-AI-engine playgrounds are out of scope; prose pages +
   in-context copy deliver "dead simple." (Easy follow-up later.)
4. **About-rail placement:** **Research** after _Tabular_; **Tools & connections** immediately before
   _Trust & citations_.

## Non-goals

- No new backend/API work; no contract change. Pure frontend copy + nav + two guide pages.
- No new interactive playground; no changes to the LQ-AI playground set.
- No redesign of the features themselves — only added explanatory copy, empty-states, and starters.
- No change to gating/permissions; the "try this" starters never bypass the tool-confirmation gate.

## Part A — In-context help (priority)

All copy below is the intended wording (plain, jargon-free); implementers use it verbatim unless a
length tweak is needed to fit. Styling matches each page's existing `mlq-*` token chrome.

### A1. Research empty state + clickable starters — `src/routes/(app)/research/+page.svelte`

When research is **enabled** and there are no results yet (`r.results.length === 0 && !r.loading`,
before the first search), render an intro block above/within the results area:

> **Search U.S. case law.** Donna looks up court opinions from CourtListener. Search by topic or
> case name, click a result to read the full opinion, and use **Verify citations** to check quoted
> text against the source.

Below it, a row of **clickable starter chips** (buttons) that fill the query and run the search via
the existing store call `r.search(q, { court, order_by })`:

- `Chevron deference` · `Brown v. Board of Education` · `qualified immunity`

Clicking a chip sets the page's `q` state to the chip text and calls `r.search(chip, { court,
order_by })` with the current filter values (default sort). The chips disappear once results exist
(same `r.results.length === 0` gate). The disabled state (`ResearchGate`) is unchanged.

### A2. MCP explainer — `src/routes/(app)/settings/mcp/+page.svelte`

Add a short explainer card directly under the existing `<h1>MCP tools</h1>` + subtitle (before the
server list), shown in all states:

> **What this is.** MCP servers are collections of external tools your operator connects — for
> example, documentation or reference lookups. Tools you enable here become available to the
> assistant in chat, and it always asks your permission before running one.

(The existing OAuth/Connections hint line stays.)

### A3. Connections explainer — `src/routes/(app)/settings/connections/+page.svelte`

Add a short explainer under the existing `<h1>Connections</h1>` + subtitle:

> **What this is.** Some tool servers ask you to sign in with your own account. Connect once here and
> the assistant can use them for you in chat — nothing runs without your sign-in.

### A4. Chat tool-loop plain-language lines — `src/lib/components/Message.svelte` + `ToolSourcesPanel.svelte`

- **Confirmation card** (`Message.svelte`, the `awaiting_confirmation` branch): add one helper line
  under the existing "The assistant wants to run … on …" text:
  > Approve to let it run this once, or Deny to skip it.
  > (Placed before/near the destructive warning; the destructive line stays as-is.)
- **Sources panel** (`ToolSourcesPanel.svelte`): add a one-line muted subtitle under the "Sources
  consulted (N)" header:
  > External sources the assistant looked up for this answer.

### A5. Assistant composer "try this" starter — `src/routes/(app)/+page.svelte`

On the landing/Assistant page (which has `message` `$state` bound to the `Composer`), add a small
**"Try:"** row beneath the composer form, shown only when the composer is empty
(`message.trim() === ''`). It offers one or more example prompts; clicking sets `message` to the
example text (the user can then send or edit it — we do **not** auto-submit):

- `⚖ Find a landmark U.S. Supreme Court case on free speech and cite it`

Keep it to 1–2 examples, visually subtle (small muted chips), consistent with the landing page's calm
styling. This is the case-law-research entry point from chat.

## Part B — `/about` guide pages (depth)

Friendly prose pages matching the existing `/about` section style (`mx-auto` prose layout, the same
heading/paragraph rhythm as `about/assistant` / `about/automations`). Each is a new
`+page.svelte` under `src/routes/(app)/about/`.

### B1. Research — `src/routes/(app)/about/research/+page.svelte`

Covers: what the Research workspace is and where to find it (the **Research** sidebar tab); that it
searches U.S. case law via **CourtListener**; how to search (topic or case name, court + sort
filters); reading an opinion in the document panel; **Verify citations** (paste text → checked against
the source); and that **the assistant can also research for you in chat** — when it consults case law
you'll see a **"⚖ N sources consulted"** pill with links to the cases. Note the deployment needs a
CourtListener API token (admin-enabled) and that the disabled state explains this.

### B2. Tools & connections — `src/routes/(app)/about/tools/+page.svelte`

Covers, as one story: **MCP tools** (operator-connected external tool collections; enable under
_Settings → MCP_); the **governed tool-loop** in chat (the assistant asks **Approve/Deny** before
running a tool, and why that matters for trust); **Connections** (OAuth servers you sign into once
under _Settings → Connections_, and the in-chat "Connect" prompt); and **external-source citations**
(the "sources consulted" provenance under an answer — distinct from the green/amber/red verified-quote
citations explained on _Trust & citations_).

### B3. AboutRail nav + Overview mention — `src/lib/about/AboutRail.svelte` + `about/overview/+page.svelte`

- Add `Research` (after `Tabular`) and `Tools & connections` (before `Trust & citations`) to the
  `AboutRail` section list, linking `/about/research` and `/about/tools`.
- Add a sentence or two to the Overview page acknowledging the Research workspace and the
  Tools & connections capabilities so the guide's tour is complete.

## Honest degradation / consistency

- The Research starters call the same `r.search(...)` path as the form — no new data path.
- All copy is static; nothing depends on a fetch. The "try this" composer chip only sets local state.
- The disabled Research state (`ResearchGate`) keeps its existing operator-token explanation.

## Testing

- **Component/render (vitest + `@testing-library/svelte`):**
  - Research page: when enabled with no results, the intro + 3 starter chips render; clicking a chip
    invokes the store `search` with the chip text. (Mock `createResearch`/the store boundary or assert
    the input value + a spy on `search`.)
  - `/about/research` and `/about/tools` pages render their key headings/landmarks (mirror an existing
    `about/*` page test if one exists; otherwise a minimal render assert).
  - `AboutRail` renders the two new links.
  - `ToolSourcesPanel`: the new subtitle renders alongside the header.
- **`svelte-check` 0/0 · `npm run lint` clean · full vitest green.**
- **Live e2e (`tests/`):** a new `tests/discoverability.spec.ts` (self-cleaning, login helper per
  `applied-skills.spec.ts`): `/about/research` and `/about/tools` load and show their headings; the
  Research page (enabled in dev) shows the starter chips and clicking one populates the search box +
  yields results; the Assistant landing shows the "Try:" example and clicking it fills the composer.

## Build shape

Subagent-driven TDD where there's logic (Research chips wiring, AboutRail), inline copy edits for the
static explainers, per-task review, whole-branch review, PR with a **merge commit**, mirror `tucuxi`.
Suggested task order:

1. A1 Research empty-state intro + starter chips (TDD the chip→search wiring).
2. A2/A3 MCP + Connections explainer cards (copy).
3. A4 chat tool-loop lines (Message confirmation helper + ToolSourcesPanel subtitle).
4. A5 Assistant composer "try this" starter (TDD the chip→message wiring).
5. B1 `/about/research` page.
6. B2 `/about/tools` page.
7. B3 AboutRail links + Overview mention.
8. Live e2e + render tests.

## Acceptance criteria

1. On `/research` (enabled, pre-search) a non-technical user sees a one-paragraph plain-language
   explanation and can click an example query to run a real search.
2. `/settings/mcp` and `/settings/connections` each show a plain "what this is" explainer.
3. A chat tool-confirmation shows plain Approve/Deny guidance; the sources panel says what it is.
4. The Assistant landing offers a clickable example case-law prompt that fills the composer.
5. `/about` has **Research** and **Tools & connections** pages, linked in the About rail, and the
   Overview acknowledges them.
6. Gates green: `check` 0/0, `lint` clean, vitest green; e2e for the about pages + Research starters +
   composer starter.
