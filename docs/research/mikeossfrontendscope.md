# Mike-LQ Frontend Scope

> **Purpose:** Scope a branch that adopts the visual language and information architecture of [MikeOSS](https://github.com/willchen96/mike) on top of the existing LQ.AI backend, gateway, and security boundary. The branch produces a "Mike-LQ" shell — MikeOSS-style frontend, LQ.AI's verified citations, anonymization, tier enforcement, audit, and skill transparency underneath.
>
> **Status:** Draft scope. No code shipped yet. This document is the implementation contract for the branch `claude/mikeoss-frontend-scope-uILRz`.
>
> **Audience:** Claude Code or any human contributor implementing the Mike-LQ shell. Read alongside [`PRD.md`](PRD.md), [`HONEST-STATE.md`](HONEST-STATE.md), [`M3-IMPLEMENTATION-PLAN.md`](M3-IMPLEMENTATION-PLAN.md), [`adr/0001-openwebui-fork-pin.md`](adr/0001-openwebui-fork-pin.md), and [`adr/0009-web-lq-ai-shell-coexistence.md`](adr/0009-web-lq-ai-shell-coexistence.md).

---

## 1. Why this exists

MikeOSS is a thin AGPL-3.0 chat-with-documents app: Next.js 16 + React 19 + Tailwind v4 + Radix UI + Lucide on the frontend; Express + Supabase + R2/S3 on the backend; per-user BYO model keys; in-browser TipTap redline editor. Its visual language and information architecture are clean and recognizable to in-house counsel who have used commercial legal-tech tools.

The LQ.AI backend — after M1 + M2 + the in-flight M3 — covers ~90% of MikeOSS's functional surface, plus capabilities MikeOSS does not have (verified citations, anonymization, tier enforcement, audit, KBs, skill versioning, gateway-as-security-boundary). A Mike-LQ shell can reuse that backend and present a MikeOSS-shaped surface to the user — without the security regressions that MikeOSS's per-user-key model implies.

See §3 for the feature-by-feature comparison.

---

## 2. Decisions locked at scope time

### Decision MLQ-1: Stay in SvelteKit; do not migrate to Next.js

[ADR 0001](adr/0001-openwebui-fork-pin.md) and [ADR 0009](adr/0009-web-lq-ai-shell-coexistence.md) pin `web/` as a SvelteKit fork of OpenWebUI. Switching to Next.js would:

- Invalidate the 456 Vitest specs + the 6 LQ.AI Cypress specs ([`HONEST-STATE.md` §6](HONEST-STATE.md#6-engineering-discipline-state)).
- Break the upstream OpenWebUI fork relationship and the path to upstream sync ([CLAUDE.md §Code style](../CLAUDE.md#javascript--typescript-web)).
- Trade a multi-month framework migration for what is fundamentally a visual reskin.

The MikeOSS *look* is framework-agnostic. The *framework* is not load-bearing for the visual goal.

### Decision MLQ-2: Keep the gateway as the single key-holder; no per-user BYO keys

MikeOSS lets each user store Anthropic/OpenAI/Gemini keys in Supabase. LQ.AI's gateway is the only component that holds privileged provider keys ([PRD §4](PRD.md#4-the-lq-ai-inference-gateway), [`gateway/app/secrets.py`](../gateway/app/secrets.py)). Adopting MikeOSS's BYO-key surface would dissolve the gateway's security boundary — the single most defensible architectural property of LQ.AI.

The Mike-LQ user-visible substitute is the existing **Inference Tier badge** ([PRD §3.13](PRD.md#313-inference-tier-awareness)) plus the routing log ([`gateway/app/routing_log.py`](../gateway/app/routing_log.py)). The user sees which model + tier their request routed to; the operator sees which user invoked which provider.

### Decision MLQ-3: Add TipTap redline pane as a SvelteKit-compatible surface

TipTap is the one MikeOSS dependency that maps to a real LQ.AI gap: an in-browser tracked-changes editor. Today LQ.AI's redline surface is the Word add-in (M3-B4, **descoped to M4/community** per [DE-287](PRD.md#de-287--word-add-in-feature-surface-chat-skills-playbooks-tier-badge--deferred-to-m4--community-contribution)). Until that lands, redlines render as markdown diffs.

TipTap ships ProseMirror-based React bindings, but TipTap core is framework-agnostic; the editor mounts on a plain DOM element. The pane wraps TipTap's vanilla `Editor` class in a Svelte component (precedent in upstream OpenWebUI for similar wrappers). No React in `web/` — the no-React rule from [CLAUDE.md §Code style](../CLAUDE.md#javascript--typescript-web) holds.

The redline pane consumes the Document Pipeline's normalized chunks + byte offsets ([ADR 0006](adr/0006-document-pipeline-architecture.md)) so its edit positions stay consistent with Citation Engine spans.

### Decision MLQ-4: Reskin LQ.AI-owned routes only; do not touch upstream OpenWebUI chrome

The reskin scope is `web/src/routes/lq-ai/**` and `web/src/lib/lq-ai/**`. Upstream OpenWebUI chrome (`/auth`, `/settings/general`, etc.) keeps its own look so the upstream-sync path stays viable. The Mike-LQ visual contract is enforced in a new design-token module (W1-1) consumed exclusively by LQ.AI-owned code.

### Decision MLQ-5: No new backend endpoints are required for W1 + W3

The scope contract is **frontend-only** for W1 and W3. Every page MikeOSS exposes maps to an existing LQ.AI endpoint (§3 catalogs the mapping). W2 (TipTap redline) adds **one** read-only endpoint that returns a structured-diff document; the diff logic itself reuses the existing skill output.

---

## 3. MikeOSS ↔ LQ.AI feature mapping

| MikeOSS surface | MikeOSS implementation | LQ.AI equivalent | Gap? |
|---|---|---|---|
| `/login`, `/signup` | Supabase Auth | `web/src/routes/auth/`, `api/app/api/auth.py` | none |
| `(pages)/account` | Per-user model + API key settings | `/lq-ai/settings`, `api/app/api/users.py` + admin key management at the gateway | architectural — see MLQ-2 |
| `(pages)/assistant` | Chat UI with PDF render + TipTap | `/lq-ai/chats/[id]`, `api/app/api/chats.py`, OpenWebUI markdown + KaTeX | redline editor missing — W2 |
| `(pages)/projects` | Project list + per-project chat history | `/lq-ai/matters/`, `api/app/api/projects.py` | none |
| `(pages)/tabular-reviews` | TBD MikeOSS surface | `/lq-ai/tabular/` (M3-C3, in flight) | timing — lands with M3-C |
| `(pages)/workflows` | TBD MikeOSS surface | `/lq-ai/playbooks/`, `api/app/api/playbooks.py` | none — Playbooks shipped M3-A1..A6 |
| Document chat (PDF/DOCX) | pdfjs-dist + mammoth | Document Pipeline + chunking | none |
| Multi-provider | OpenRouter SDK, BYO keys | Gateway router (Anthropic, OpenAI, Azure, Ollama) | Vertex/Bedrock deferred (DE-034/035) |
| XLSX export | exceljs in browser | M3-C4 (server-side via openpyxl) | timing — lands with M3-C |
| Object storage | S3/R2 presigned URLs | MinIO/local today | small adapter gap, out of scope |
| Email confirmation | Supabase | Operator-configured SMTP | none |
| Citation grounding | none in MikeOSS | Citation Engine 4-stage cascade, 5-state UI | **LQ.AI advantage** |
| Anonymization | none in MikeOSS | Presidio + legal recognizers + privileged carve-out | **LQ.AI advantage** |
| Audit log | none in MikeOSS | `api/app/audit.py` | **LQ.AI advantage** |
| Tier awareness | none in MikeOSS | Tier badge + tier-floor refusal | **LQ.AI advantage** |
| Skill transparency | none in MikeOSS | Skills directory, version tab, try-it sandbox | **LQ.AI advantage** |

Net: one functional gap (TipTap redline pane, W2). Two timing-bound surfaces (Tabular + XLSX export, both inside the M3 work that's already in flight on `main`). Everything else is a reskin.

---

## 4. Workstream summary

| Workstream | Title | Effort | Critical path |
|---|---|---|---|
| **W1** | Visual reskin of `/lq-ai/*` to MikeOSS design language | ~7–10 days | independent |
| **W2** | TipTap redline pane on chat / matter surface | ~5–7 days | depends on W1-1 (tokens) only |
| **W3** | IA mapping + transparency-story documentation | ~0.5 day | independent |

W1 and W2 can run in parallel after W1-1. W3 lands at the end of the branch as the docs companion.

---

## Phase W1 — Visual reskin (~7–10 days)

The reskin scope is `web/src/routes/lq-ai/**` and `web/src/lib/lq-ai/**` per Decision MLQ-4.

### Task W1-1 — Design-token module + Tailwind config extension

**Scope:**
- Create `web/src/lib/lq-ai/styles/tokens.ts` exporting the MikeOSS-aligned palette, typography scale, spacing, and radii as CSS custom properties.
- Extend `web/tailwind.config.js` with a `lq-ai` plugin that registers the tokens as Tailwind utility classes (`bg-mlq-surface`, `text-mlq-muted`, `border-mlq-subtle`, etc.). Plugin is scoped via Tailwind's `content` config to LQ.AI-owned paths only — upstream OpenWebUI files do not pick up the tokens.
- Add a `radix` mirror layer at `web/src/lib/lq-ai/components/primitives/` wrapping the headless primitives we already use (or need): `DropdownMenu`, `Dialog`, `Tooltip`, `Tabs`, `Slot`. Svelte equivalents — no React Radix is pulled in. Existing candidates: [`bits-ui`](https://www.bits-ui.com/) (Svelte port of Radix-style primitives) or [`melt-ui`](https://www.melt-ui.com/). Pick one in W1-1 and pin a version.
- Replace the LQ.AI shell's icon usage with `lucide-svelte` (already a transitive of bits-ui or pinned standalone).

**Dependencies:** None.

**Output:** A token-and-primitive substrate that subsequent W1 tasks consume. No visible UI change yet — the substrate is ready but unused.

**Verification:**
- `npm run check:lq-ai` passes with 0 errors.
- Vitest unit test in `web/src/lib/lq-ai/styles/__tests__/tokens.test.ts` asserts every token in `tokens.ts` exists as a CSS custom property at runtime.
- Storybook (or a `/lq-ai/admin/dev/tokens` route gated to admins) renders all tokens + primitives for visual review.
- Bits-ui / melt-ui pin is documented in [`docs/security/dependencies.md`](security/dependencies.md) with SBOM justification (Decision MLQ-4 implies one new top-level dep; primitive-library choice noted here).

**Acceptance criteria:**
- [ ] `tokens.ts` exports ≥ 24 tokens (palette: 12+, typography: 6+, spacing: 4+, radii: 2+).
- [ ] Tailwind plugin compiles and is consumed by at least one LQ.AI-owned component in a smoke test.
- [ ] Bits-ui (or melt-ui) version pinned in `package.json` with rationale comment.
- [ ] No new dependency added to upstream-OpenWebUI-owned paths.
- [ ] All 5 primitives have a Svelte wrapper + a basic Vitest mount test.

**Effort:** 1.5–2 days.

---

### Task W1-2 — Chat surface reskin (`/lq-ai/chats/*`, composer, message list)

**Scope:**
- Reskin `web/src/lib/lq-ai/components/chat/**` and `web/src/routes/lq-ai/chats/**` to consume W1-1 tokens.
- Match MikeOSS's chat IA: left sidebar with conversation list grouped by project/matter, center column with messages + sticky composer, right rail collapsible for citations / receipts / sources.
- Composer adopts the MikeOSS shape: rounded surface, model picker chip on the left, slash-command + KB-attach affordances on the right, send button as the primary CTA. Existing `Enhance Prompt (⌘E)` button stays.
- Message list: assistant messages render with the LQ.AI 5-state Citation Engine UI ([`HONEST-STATE.md` §3.1](HONEST-STATE.md#31-citation-engine--shipped-m2-4-stage-cascade)) unchanged; only the chrome around them changes.
- Receipts drawer keeps its existing endpoint contract; the visual is restyled to a side-rail panel matching MikeOSS's `right-side-panel` shape.

**Dependencies:** W1-1.

**Output:** The chat surface looks like MikeOSS; the underlying chat API, SSE streaming, citation rendering, anonymization indicator, and tier badge are untouched.

**Verification:**
- Existing `web/cypress/e2e/chat.cy.ts` passes unchanged.
- Existing `wave-d1-power-features.cy.ts` Test 1 (Enhance Prompt), Test 2 (KB attach), Test 4 (Receipts) pass unchanged.
- New Vitest snapshot tests for the reskinned composer + message-row components.
- Manual side-by-side: MikeOSS chat surface vs. Mike-LQ chat surface; visual delta is ≤ "obviously the same product family."

**Acceptance criteria:**
- [ ] All existing chat-surface Cypress specs pass with zero modification.
- [ ] Composer renders model-picker chip + KB-attach + Enhance + send in the MikeOSS layout.
- [ ] Citation 5-state chips render with the new tokens; color contrast hits WCAG 2.1 AA (verify with axe DevTools).
- [ ] Receipts drawer collapses to a right-rail panel; existing receipts endpoint unchanged.
- [ ] No new API calls; network panel shows the same endpoints as pre-reskin.

**Effort:** 2–2.5 days.

---

### Task W1-3 — Matters / projects surface reskin (`/lq-ai/matters/*`)

**Scope:**
- Reskin `web/src/routes/lq-ai/matters/+page.svelte` (matter list) and `web/src/routes/lq-ai/matters/[id]/+page.svelte` (matter detail) to consume W1-1 tokens.
- Matter list adopts MikeOSS `projects` IA: card grid (or table-row hybrid) with project name, contract type, last activity, privileged badge, owner avatar.
- Matter detail adopts MikeOSS `project` IA: header with name + privileged toggle + tier-floor selector; tabs for Chats / Files / Skills / KBs / Playbooks; right rail for activity feed.
- Privileged badge gets a distinct token (`bg-mlq-privileged`) so it is visually unambiguous — privileged matters are the highest-stakes ones; the badge should be impossible to miss.

**Dependencies:** W1-1.

**Output:** Matters surface matches MikeOSS projects IA; LQ.AI's privileged-matter + tier-floor + audit semantics remain visible and unmistakable.

**Verification:**
- Existing `wave-c-matters` Cypress specs pass unchanged.
- New Vitest snapshot tests for the matter card and matter detail header.
- Privileged badge has a Cypress assertion that its background contrasts ≥ 7:1 against the surrounding surface (AAA — privileged is a high-stakes signal worth the extra contrast).

**Acceptance criteria:**
- [ ] Matter list card grid renders correctly at 1024px, 1280px, 1440px widths.
- [ ] Privileged toggle uses the bits-ui Switch primitive from W1-1.
- [ ] Tabs (Chats/Files/Skills/KBs/Playbooks) use the bits-ui Tabs primitive from W1-1.
- [ ] All existing wave-c specs pass.
- [ ] Privileged badge contrast verified ≥ 7:1.

**Effort:** 1.5 days.

---

### Task W1-4 — Skills + Playbooks surfaces reskin

**Scope:**
- Reskin `web/src/routes/lq-ai/skills/**` (skill list, skill detail with versions/try-it/audit-log tabs) and `web/src/routes/lq-ai/playbooks/**` (playbook list, execution flow, execution result view) to consume W1-1 tokens.
- Skill list adopts MikeOSS's `assistant`-equivalent surface: large search bar, faceted filters (category, author, contract type), card grid with one-click "Use in chat."
- Skill detail preserves the existing Versions / Try-it / Audit-log tab structure ([`HONEST-STATE.md` §1](HONEST-STATE.md#1-conversational-and-workspace-surface)) — these are the transparency surfaces and they keep their information; only chrome changes.
- Playbook list + execution result view: reuse the same card + result-row patterns from W1-3.

**Dependencies:** W1-1.

**Output:** Skills and Playbooks surfaces match MikeOSS visual language; the **transparency** surfaces (versions, audit log, try-it) remain prominent.

**Verification:**
- Existing `wave-b-surfaces` and `wave-d2-skill-creator` Cypress specs pass unchanged.
- Existing `m3-a-playbook-execution.cy.ts` passes unchanged.
- Manual review: a user looking at a skill detail page can still see the version history + audit log + try-it sandbox within 1 click of the skill name.

**Acceptance criteria:**
- [ ] All existing skill-surface and playbook-surface Cypress specs pass.
- [ ] Try-it sandbox button is above the fold on a skill detail page at 1024px width.
- [ ] Version-history table renders at least the last 10 versions without horizontal scroll.
- [ ] Playbook result view's per-position card layout supports a 30-position playbook without cognitive overload (manual walk-through).

**Effort:** 2 days.

---

### Task W1-5 — KBs, saved prompts, settings, trust surfaces reskin

**Scope:**
- Reskin `web/src/routes/lq-ai/knowledge/**`, `web/src/routes/lq-ai/saved-prompts/**`, `web/src/routes/lq-ai/settings/**`, `web/src/routes/lq-ai/trust/**` to consume W1-1 tokens.
- KB list + KB detail: card + table-row hybrid; document list with ingest-status badge (depends on [DE-276](PRD.md#de-276--ingest-observability-surface-silent-embedparse-failures) shipped in M3-0.3).
- Saved Prompts library: MikeOSS's `account`-equivalent IA, with a one-click "Use in chat" affordance.
- Settings: split into General / Account / API / Notifications panels, MikeOSS-style left-rail nav.
- Trust page: this is the LQ.AI-specific transparency surface — gets enhanced treatment (links to citation-method counts, anonymization config, gateway version, audit-log shortcut). Per Decision MLQ-4 and the "transparency-as-founding-principle" framing ([PRD §1.3](PRD.md#13-transparency-as-a-founding-principle)) this page should be **more** prominent in Mike-LQ than equivalents in MikeOSS would be.

**Dependencies:** W1-1.

**Output:** All remaining LQ.AI-owned routes match the Mike-LQ visual language.

**Verification:**
- Existing `wave-m1-final-surfaces` and `wave-d1-power-features` Cypress specs pass unchanged.
- New Vitest snapshot tests for the reskinned KB card and settings nav.
- Manual: Trust page passes a "5-second test" — can a new user identify what makes Mike-LQ different from MikeOSS within 5 seconds of landing on /lq-ai/trust? (Answer should be: verified citations, anonymization, audit.)

**Acceptance criteria:**
- [ ] All existing Cypress specs for these surfaces pass.
- [ ] KB document list renders ingest-status badge per [DE-276](PRD.md#de-276--ingest-observability-surface-silent-embedparse-failures).
- [ ] Trust page links to: citation-method count (`SELECT method, count(*) FROM message_citations`), anonymization config endpoint, gateway version endpoint, audit-log admin page.
- [ ] Settings nav uses bits-ui Tabs or NavigationMenu primitive from W1-1.

**Effort:** 1.5–2 days.

---

## Phase W2 — TipTap redline pane (~5–7 days)

The one net-new functional surface. Renders structured redlines as a tracked-changes-style editor view in the browser, bound to the existing Document Pipeline's normalized chunks and byte offsets.

### Task W2-1 — Redline data contract + read endpoint

**Scope:**
- Define the redline document shape that the editor consumes. Schema in `api/app/schemas/redlines.py`:
  ```
  RedlineDocument {
    document_id: UUID
    base_content: str               # normalized source text
    ops: list[RedlineOp]
  }
  RedlineOp = {
    kind: 'insert' | 'delete' | 'replace' | 'comment'
    range: [start_offset, end_offset]   # byte offsets into base_content
    new_text: str | None
    comment_text: str | None
    rationale: str                   # the skill's justification
    citations: list[Citation]        # reuse existing Citation type
    severity: 'critical' | 'high' | 'medium' | 'low' | None
  }
  ```
- New endpoint: `GET /api/v1/chats/{chat_id}/messages/{message_id}/redlines` returns a `RedlineDocument` derived from the assistant message's structured output. Read-only; no new write surface.
- Extract redline operations from existing skill outputs in `api/app/redlines/extract.py`:
  - For skills that already emit redlines (`nda-review`, `msa-review-saas`, etc.), parse the existing structured output into `RedlineOp` records.
  - For chat replies that mention redlines inline, the extractor returns an empty `ops` list — the endpoint returns the base content without ops rather than an error.
- Update `docs/api/backend-openapi.yaml` for the new endpoint.

**Dependencies:** W1-1 (so the editor renders against a styled surface). Phase A of M3 (Playbook outputs include structured redlines).

**Output:** The frontend can fetch a structured redline document for any chat message that produced redlines.

**Verification:**
- Unit tests in `api/tests/redlines/test_extract.py`: round-trip from a skill's structured output to a `RedlineDocument`; empty-ops case; multi-op case.
- Integration test in `api/tests/test_redline_endpoint.py`: send a chat through the `nda-review` skill, request the redline document, assert ops count + first op shape.
- OpenAPI conformance test holds.

**Acceptance criteria:**
- [ ] Schema published in `api/app/schemas/redlines.py` with full Pydantic typing.
- [ ] Endpoint returns 200 + valid `RedlineDocument` for a redline-producing skill.
- [ ] Endpoint returns 200 + empty-ops `RedlineDocument` for a non-redline message (not 404).
- [ ] No write endpoint added.
- [ ] All citation references resolve against the existing `message_citations` table.
- [ ] OpenAPI YAML updated; conformance test passes.

**Effort:** 1–1.5 days.

---

### Task W2-2 — Svelte TipTap wrapper component

**Scope:**
- New component `web/src/lib/lq-ai/components/redline/RedlineEditor.svelte`:
  - Wraps `@tiptap/core` (vanilla `Editor` class — no React).
  - Mounts on a Svelte-managed `<div>` reference; cleans up in `onDestroy`.
  - Consumes a `RedlineDocument` prop and renders ops as ProseMirror marks (TipTap's "track changes" pattern: `<ins>` for inserts, `<del>` for deletes, custom marks for comments).
  - Read-only by default (`editable: false`); editing is M4 / out of scope for the branch.
  - Hover-on-op shows a popover with the op's `rationale` + citation chips (5-state Citation Engine UI).
- Pin a TipTap version (latest stable) in `web/package.json`; document the dep in [`docs/security/dependencies.md`](security/dependencies.md) — it is the second net-new top-level dep on the branch (after bits-ui/melt-ui in W1-1).
- The component does NOT pull `@tiptap/react`, `@tiptap/pm` extras beyond what `@tiptap/core` provides, or any React shim.

**Dependencies:** W1-1, W2-1.

**Output:** A reusable Svelte redline editor that takes a `RedlineDocument` and renders it as tracked-changes.

**Verification:**
- Vitest mount test: render a synthetic `RedlineDocument` with one insert, one delete, one comment; assert the resulting DOM contains `ins`, `del`, and a comment-marker element.
- Visual review at `/lq-ai/admin/dev/redline-demo` (gated to admin, removed before branch merge or left as dev-only): synthetic redline renders cleanly.
- Mass-popover test: hover each op shows the rationale + citations.
- Cleanup test: mount → unmount → re-mount does not leak DOM nodes.

**Acceptance criteria:**
- [ ] Component renders insert / delete / replace / comment ops correctly.
- [ ] Hover popover shows rationale + Citation Engine 5-state chips.
- [ ] Component is read-only.
- [ ] No `@tiptap/react` or React in the dep tree (grep `package-lock.json` to confirm).
- [ ] Vitest mount + cleanup tests pass.

**Effort:** 2–2.5 days.

---

### Task W2-3 — Wire the redline pane into chat and matter surfaces

**Scope:**
- Add a "View redlines" affordance to any chat assistant message whose `redlines` endpoint returns ≥ 1 op. The affordance opens a right-rail pane (same shape as the existing receipts drawer) containing `RedlineEditor.svelte`.
- Add a "Redlines" tab to the matter detail right rail; the tab lists all redline-producing messages across the matter's chats and lets the user open any one in the pane.
- Persistence: pane open/closed state and last-viewed redline are persisted in the existing `lq-ai-preferences` store ([`web/src/lib/lq-ai/preferences/`](../web/src/lib/lq-ai/preferences/)).
- Cypress E2E `web/cypress/e2e/w2-redline-pane.cy.ts`: send a chat to `nda-review`, open the redline pane, assert ≥ 1 op renders.

**Dependencies:** W2-2.

**Output:** Users see redlines as a tracked-changes editor inside the chat surface, citation-grounded, without leaving the browser.

**Verification:**
- New Cypress spec passes.
- Manual: walk a real NDA through `nda-review`; the redlines render with citations + rationales.
- Manual: matter detail "Redlines" tab lists redline-producing messages and the pane switches between them.

**Acceptance criteria:**
- [ ] "View redlines" affordance only renders for messages with ops.
- [ ] Right-rail pane opens / closes via bits-ui Sheet primitive from W1-1.
- [ ] Matter detail Redlines tab lists all redline-producing messages in the matter.
- [ ] Cypress E2E passes against a live `nda-review` round-trip.
- [ ] Pane state persists across reloads.

**Effort:** 1.5–2 days.

---

### Task W2-4 — Tier + anonymization signal on redline pane

**Scope:**
- The redline pane header shows the Inference Tier badge for the message that produced it (read from existing chat-message metadata).
- An "Anonymized" indicator appears if the gateway middleware ran for that message (read from `gateway/app/anonymization/middleware.py` audit fields surfaced by the chat-receipts endpoint).
- Both indicators link through to their explanation surfaces — the tier badge to the tier-detail panel, the anonymization indicator to [`docs/security/anonymization.md`](security/anonymization.md).

**Dependencies:** W2-3.

**Output:** The redline pane is unmistakably an LQ.AI-grounded surface; even an in-browser tracked-changes view carries the gateway's tier + anonymization context.

**Verification:**
- Manual: route a redline through Tier 3 + anonymized; verify both indicators render. Route through Tier 1 (Ollama) + privileged matter; verify "Anonymized" indicator is absent (privileged carve-out) and tier reads "Tier 1."

**Acceptance criteria:**
- [ ] Tier badge renders in redline pane header for every redline message.
- [ ] Anonymization indicator present iff `chat_receipts` records anonymization for the message.
- [ ] Both indicators are keyboard-focusable and have ARIA labels.
- [ ] Click-through opens the explanation surface.

**Effort:** 0.5–1 day.

---

## Phase W3 — IA mapping + transparency story (~0.5 day)

### Task W3-1 — IA mapping doc

**Scope:**
- Create `docs/mikeoss-ia-mapping.md` documenting the user-visible terminology choices and the LQ.AI equivalents:
  - assistant ↔ chats
  - projects ↔ matters
  - workflows ↔ playbooks
  - tabular-reviews ↔ tabular (M3-C)
  - account ↔ settings + admin gateway key management
- For each mapping, document the LQ.AI capabilities the user gains (verified citations, anonymization, audit, tier awareness, KBs, skill versioning).
- Cross-link from `README.md` "Project status" section and from `docs/HONEST-STATE.md` §1.

**Dependencies:** None.

**Output:** A reader who knows MikeOSS can read the mapping doc and understand what they get + what they keep + what's stronger in Mike-LQ.

**Acceptance criteria:**
- [ ] Doc covers all 5 IA mappings above.
- [ ] Each mapping lists ≥ 1 LQ.AI-only capability the user gains.
- [ ] `README.md` links to the new doc.
- [ ] `HONEST-STATE.md` §1 cross-references the new doc.

**Effort:** 0.5 day.

---

## 5. Effort summary

| Phase | Effort | Calendar (1 engineer) |
|---|---|---|
| W1 (5 tasks) | 7–10 days | 1.5–2 weeks |
| W2 (4 tasks) | 5–7 days | 1–1.5 weeks |
| W3 (1 task) | 0.5 day | 0.5 day |
| **Total** | **12.5–17.5 days** | **~3 weeks** |

W1-1 is the only true blocker; after it lands, W1-2..W1-5 and W2-1..W2-4 can parallelize on a 2-engineer team to ~1.5 weeks.

---

## 6. Out of scope

The following are explicitly **not** in the branch:

- **Next.js migration.** Per Decision MLQ-1.
- **Per-user BYO model keys.** Per Decision MLQ-2.
- **S3/R2 storage adapter.** Independent enhancement; file as DE-XXX in PRD §9 if motivated.
- **Editable redline pane.** W2 ships read-only; an edit surface is a separate scope (likely M4-adjacent).
- **Reskinning upstream OpenWebUI chrome.** Per Decision MLQ-4.
- **Tabular Review + XLSX export.** Lands in M3-C on `main`; the Mike-LQ branch rebases when M3-C ships.
- **MikeOSS's `support` page.** LQ.AI's equivalent is the existing Trust page; W1-5 enhances it.
- **Replacing the Word add-in surface.** Word add-in remains the canonical Word-native experience (M4 / community per DE-287); W2 is the browser-native complement, not a replacement.

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bits-ui / melt-ui primitive coverage gap (some Radix primitive has no Svelte port) | low–medium | W1-1 audits coverage upfront; uncovered primitives drop to plain Svelte + WAI-ARIA. |
| TipTap vanilla integration friction in Svelte (most examples are React) | medium | Allocate a 0.5-day spike inside W2-2; precedent exists in OpenWebUI upstream for similar integrations. |
| Visual reskin diverges from MikeOSS as the latter evolves | low | Pin to the MikeOSS commit referenced in §3; track divergence as a single doc-update task per release. |
| Reskin breaks an upstream OpenWebUI surface accidentally | low | Tailwind plugin is `content`-scoped to LQ.AI paths; CI grep for token usage in upstream paths blocks. |
| New deps (bits-ui, TipTap) raise SBOM / supply-chain concern | medium | Document both in `docs/security/dependencies.md`; both are widely-used OSS with active maintainers; SBOM entries justified. |

---

## 8. Verification — the branch is "done"

A reviewer can confirm the branch is mergeable by checking each of the following in source:

1. `npm run check:lq-ai` exits 0.
2. `npx vitest run` passes (existing 456 + new W1/W2 tests; expect ~470+ at branch close).
3. `npx cypress run` passes all 6 existing LQ.AI specs + the new `w2-redline-pane.cy.ts`.
4. `cd api && pytest` passes (existing 1001 + new W2-1 redline tests).
5. Manual: side-by-side screenshots of MikeOSS and Mike-LQ at chat / matter / skill / KB / settings surfaces. Visual delta is "obviously the same product family."
6. Manual: `/lq-ai/trust` page lists the LQ.AI-only capabilities (citations, anonymization, audit, tier) prominently. A new user can identify them within 5 seconds.
7. Manual: an `nda-review` round-trip produces a redline pane with ≥ 1 op, citation chips, tier badge, anonymization indicator.

If any of (1)–(4) fails, the branch is not done. If any of (5)–(7) feels off, the visual / transparency contract is not met and the branch lands a follow-up before merge.

---

## 9. Open questions

1. **bits-ui vs melt-ui** — W1-1 decides. Both are credible; bits-ui has higher Radix-API parity, melt-ui has lower-level primitives. Default recommendation: bits-ui for API parity.
2. **TipTap version pin** — W2-2 decides. Default recommendation: latest stable at branch-open time.
3. **Trust page enhancement scope** — W1-5 ships baseline; an expanded trust page with live metrics (citation-method counts, anonymization counts, recent audit events) is a candidate follow-up DE.
4. **Branch lifecycle** — does Mike-LQ land as a permanent shell-coexistence (alongside the current OpenWebUI-derived shell, per ADR 0009 precedent), or replace it? The scoping default is **coexistence**: ship Mike-LQ as the LQ.AI-owned shell; keep the upstream chrome for upstream-sync compatibility. Resolve before merge.

---

*Maintained by the maintainer team on `claude/mikeoss-frontend-scope-uILRz` until the branch lands or is retired.*
