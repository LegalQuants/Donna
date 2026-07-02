# Design: Fiduciary Slice 5 — Documentation & Education

> **Status:** approved design (brainstorm complete) — pending spec review, then `writing-plans`.
> **Date:** 2026-07-02
> **Segment:** the fiduciary-grade auditability segment. **Slice 5** of
> `docs/superpowers/specs/2026-07-01-fiduciary-auditability-design.md` (§5 Slice 5), refined with the
> **audience/positioning steer** (2026-07-02) and the **LQ-AI capability/visualization snapshot** (their
> `docs/LQVern/donna-sync-2026-07-02.md`, PR #260). Slices 0–4 are shipped.

---

## 1. Goal & audience

Teach Donna's **non-technical legal user** what the fiduciary-auditability features (shipped in Slices
0–4) mean and how to use them — **at a high level, in plain language, with progressive drill-down** for
anyone who wants the mechanism. Mirror LQ-AI's honest, don't-overclaim posture.

Two products: a new **`/about/fiduciary`** guide page (the high-level hub) and **one** new Donna-side
interactive playground (`trust-states.html`), plus a repo/user **docs refresh**. Everything deeper than
the Donna experience layer is **pointed at LQ-AI's engine visualizations**, not rebuilt.

## 2. The decisive constraint — what LQ-AI offers today (point vs. build)

From LQ-AI's snapshot (their `docs/LQVern/donna-sync-2026-07-02.md`):

- **LQ-AI has NO fiduciary-grade visualizations yet.** The 5 fiduciary playgrounds (`citation-ledger`,
  `fiduciary-gate`, `matter-session-flow`, `authority-sources`, `treatment-layer`) are **sub-project 2,
  not built**; slugs are **proposed, not final** — LQ-AI explicitly says **do not hard-link them** (they
  will 404) and will update the sync doc with final URLs when they ship.
- **What IS live** (19 playgrounds, already vendored into Donna's `static/learn/playgrounds/`) covers the
  upstream **mechanism** — most relevantly **`citation-engine-cascade`** (the 4-stage character-fidelity
  citation verification) and `governed-tool-flow` (the governed tool boundary).

Therefore:

| Topic                                                 | Decision                                    | Why                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "How a quote gets verified" (the mechanism)           | **Point** → local `citation-engine-cascade` | LQ-AI already covers it well; rebuilding would duplicate, worse.                                                          |
| "The four trust-pill states you meet in a chat"       | **Build** → `trust-states.html`             | Donna-specific UX vocabulary (labels/colors/honesty rule); LQ-AI's planned `fiduciary-gate` is a different, engine layer. |
| Ledger / treatment / authority-sources deep explorers | **Mention, don't link**                     | Coming from LQ-AI sub-project 2; hard-linking now 404s. A follow-up wires them when they ship.                            |

## 3. Honest caveats to carry (verbatim posture)

The prose must carry these, mirroring LQ-AI's caveats and our own locked decisions:

- **Treatment is "derived, not editorial"** — a signal with a trace to citing cases, **not** an
  authoritative citator. Never color a case good/bad law.
- **The ledger references content by id/offset**, not raw payloads — it records _what was read and
  whether the quote matched_, re-verifiable against the original.
- **The provenance export (Slice 4) is an honest copy, not a signed attestation** — reuse the verbatim
  `PROVENANCE_DISCLAIMER`.
- **The zero-assertion honesty rule** — "No sourced claims" is neutral, never green; it means _nothing to
  verify_, not _verified_.
- **Authority sources are behind operator config**; **EUR-Lex is get-by-CELEX only** (no keyword search
  yet — LQ-AI DE-374). State availability honestly.

## 4. Components

### 4.1 `/about/fiduciary/+page.svelte` — the high-level guide (new)

A bare prose page mirroring the canonical template `about/overview/+page.svelte` (no `<script>` beyond
the embed; the recurring Tailwind prose vocabulary: h1 `mb-4 text-xl font-medium text-mlq-text`, h2
`mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase`, p
`mb-3 max-w-prose text-sm leading-relaxed text-mlq-text`, ul `mb-3 ml-4 list-disc space-y-1`). The
closest sibling for the state legend is `about/trust/+page.svelte`. Renders at the default `max-w-5xl`
(no layout change); the "Powered by LQ-AI" callout auto-appears (good — it points at the engine).

Section flow (each: plain-language first, drill-down link where relevant):

1. **Intro** — "An honest provenance record on every answer." What fiduciary-grade means for _you_.
2. **The four trust states** — the green/amber/red/grey legend (reusing the `about/trust` `<ul>`
   pattern), then the **embedded `trust-states.html` playground** (§4.3) as the interactive explainer.
   States: **Fiduciary-grade** / **Supported** / **Needs review** / **No sourced claims** (neutral, the
   honesty rule).
3. **The fiduciary receipt & citation ledger** — the per-turn receipt (trust pill → expandable ledger of
   sources + quoted passages + verification chips), "trace this claim to its source." Caveat: id/offset,
   not raw payloads.
4. **Case treatment (validity)** — derived signals (cited-by, followed/distinguished/criticized) with a
   trace to citing cases. Caveat: "derived, not editorial."
5. **Matter sessions — the audit timeline** — the autonomous-session receipt (Slice 3): who did what, on
   whose behalf, at what cost, and whether the output is fiduciary-grade.
6. **Authoritative sources** — the research-sources registry (Slice 0): CourtListener / GovInfo / SEC
   EDGAR / EUR-Lex, retrieve-and-verify, behind operator config; EUR-Lex get-by-CELEX only.
7. **Take it with you — provenance export** (Slice 4) — JSON + printable Markdown; honest copy, not a
   signed attestation.
8. **Under the hood** — a "drill down →" to the local **`citation-engine-cascade`** playground for the
   verification mechanism, plus one honest sentence that deeper interactive explorers of the ledger,
   gate, authority sources, and treatment are **coming from the LQ-AI engine** (no hard link yet).

### 4.2 `AboutRail.svelte` rail entry (modify)

Add `{ href: '/about/fiduciary', label: 'Fiduciary receipts' }` to the `sections` array in
`src/lib/about/AboutRail.svelte`, right after the `trust` entry (topically adjacent). Active-state logic
already matches `pathname === href || startsWith(href + '/')`.

### 4.3 `static/learn/playgrounds/trust-states.html` — the one new Donna playground (new)

A **self-contained single HTML file** (inline `<style>` + `<body>` + vanilla-JS `<script>`, no imports),
mirroring the anatomy of the existing playgrounds (e.g. `tier-system.html`): the **standalone dark
palette** (NOT Donna's `mlq-*` tokens — reproduce the pill colors as green `#16a34a` / amber `#c9a227` /
red `#dc2626` / neutral grey `#9ca3af`, the values from `src/app.css`), the `↩ Learn` back-link header
(`href="../../"`, matching the other playgrounds), and an aside-controls + preview-pane split.

**What it demonstrates** (the Donna trust vocabulary, faithful to `src/lib/fiduciary/trust.ts`):

- Controls: a **gate status** selector (`fiduciary_grade` / `supported_only` / `flagged`) and a
  **total assertions** control (0 vs. >0).
- Preview: renders the resulting **pill** (rounded-full bordered chip + leading dot + label,
  reproducing `FiduciaryPill.svelte`'s look) with its plain-language `explanation`, computed by the
  same rules as `gateVerdict`:
  - `fiduciary_grade` + `total_assertions === 0` → **No sourced claims** (neutral grey — the honesty
    rule, checked first, **never green**).
  - `fiduciary_grade` + assertions > 0 → **Fiduciary-grade** (green).
  - `supported_only` → **Supported** (amber).
  - `flagged` / anything else → **Needs review** (red, fail-safe).
- A short "why this state" caption per state, and a visible callout of the **zero-assertion honesty
  rule** (the whole point: green is earned, not defaulted).

Embedded on `/about/fiduciary` via the inline-iframe pattern (from `about/lq-ai/build/+page.svelte`):
`<iframe src="/learn/playgrounds/trust-states.html" title="…" loading="lazy" class="mt-2 h-[900px]
w-full rounded-mlq-control border border-mlq-subtle">` + an "Open full-screen ↗" link. **Not** registered
in `lqLearnSections.ts` (that array is the lq-ai engine set on `/about/lq-ai`); it lives scoped to the
fiduciary page.

### 4.4 Docs refresh (modify) + About PDF

- **`README.md`** — add a fiduciary-receipts bullet to "What's inside"; note the new About page.
- **`docs/PRODUCT.md`** — extend the "Trust & control" section (L97) with the fiduciary receipt / ledger
  / treatment / autonomous-audit / export story; keep the honest caveats.
- **`docs/GUIDE.md`** — extend "Trust & citations — the heart of it" (L316) with a friendly walkthrough
  of the receipt, the four states, the ledger, treatment, and export.
- **`CHANGELOG.md`** — a new dated entry summarizing the fiduciary segment (Slices 0–4 features + this
  slice's docs/education).
- **About PDF** — regenerate for the new capabilities (the existing export step; ship the new
  `docs/About-Donna-<version>.pdf` if the pipeline versions it, else refresh the current file).

## 5. Testing strategy (CLAUDE.md gates)

- **Component — `/about/fiduciary`:** renders the page (h1, the four state labels
  `Fiduciary-grade`/`Supported`/`Needs review`/`No sourced claims`, the `trust-states.html` iframe
  `src`, and the `citation-engine-cascade` drill-down link `href`). Mirror an existing About page test
  if one exists; otherwise a focused `@testing-library/svelte` render test.
- **Component — `AboutRail`:** extend `AboutRail.svelte.test.ts` (if present) / add an assertion that the
  `Fiduciary receipts` entry with `href="/about/fiduciary"` renders.
- **Playground:** static HTML has no unit harness in this repo; validated by the live e2e below (iframe
  loads, controls drive the pill). Keep the file self-contained so nothing else can break it.
- **Live e2e (`fiduciary-about.spec.ts`):** log in, visit `/about/fiduciary`, assert the rail link and
  the page's four state labels are visible and the `trust-states.html` iframe is present; then, inside
  the iframe, drive the gate-status control and assert the rendered pill label changes (at minimum:
  select `supported_only` → "Supported"; set `fiduciary_grade` + 0 assertions → "No sourced claims").
  No DB seeding needed (static content). Self-contained.
- **Docs:** no automated test; manually confirm no broken links and that caveats are present. Do **not**
  add links to LQ-AI's unbuilt fiduciary slugs.
- **Gates every task:** `npm run check` 0/0, `npm run lint` green, `npx vitest run` passing.

## 6. Out of scope / deferred

- **No** `quote-verification.html`, `citation-ledger.html`, `treatment-layer.html`, etc. — point at
  LQ-AI's engine (`citation-engine-cascade`) and await sub-project 2 for the rest.
- **No hard links to LQ-AI's proposed fiduciary slugs** (they'll 404). Prose mentions them as "coming."
- **No pin bump**, no backend change, no new API.
- **Follow-up (separate, when LQ-AI sub-project 2 ships):** wire the final fiduciary-playground URLs from
  the updated `donna-sync` doc into `/about/fiduciary` (and/or `lqLearnSections.ts`). Captured here so it
  isn't forgotten.

## 7. Sequencing

Within the segment: **Slice 5 (this) → 6-lean (contextual discovery) → file 2 upstream asks → release
cut.** This slice: light `writing-plans` → subagent-driven TDD → two-stage review per task →
whole-branch review → PR **with a merge commit** (never squash) → mirror `main` to `tucuxi`. The About
PDF regen + release images/DMG ride the release tail.

## 8. Decisions locked

1. Audience = **non-technical legal user**; **high-level with progressive drill-down**; honest posture.
2. Positioning = a **standalone `/about/fiduciary` hub** that drills into the existing `/about/lq-ai`
   engine playgrounds; default `max-w-5xl` (no layout change).
3. Playgrounds = **build `trust-states.html` only** (the Donna-specific gap); **point** at
   `citation-engine-cascade` for verification; **don't hard-link** LQ-AI's unbuilt fiduciary slugs.
4. Docs = **full set** (README, PRODUCT, GUIDE, CHANGELOG) + **About PDF regen**.
5. `trust-states.html` faithfully reproduces `trust.ts`'s four states + the zero-assertion honesty rule,
   in the playgrounds' standalone dark-palette style.
