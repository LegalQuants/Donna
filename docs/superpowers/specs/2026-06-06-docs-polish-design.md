# Docs-polish milestone — design

**Date:** 2026-06-06 · **Status:** approved by user (brainstorm session)
**Scope source:** the user-locked docs-polish scope (About refresh → repo presentation) plus two
banked copy nits from the 2026-06-05 review backlog.

## Goal

Make the repository present accurately and well, top to bottom: bring the `/about` guide current
with everything shipped since it was authored (Automations end-to-end, BYOK, run Results, editable
matter, ensemble verification), then give the repo a product-grade front page (README rewrite,
LICENSE, acknowledgements).

## Shape: two sequential loops, two PRs

|          | Branch                   | Contents                                                                 | Verification                                                                           |
| -------- | ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **PR 1** | `feat/about-refresh`     | About guide brought current + new Automations page + two copy nits       | `npm run check` 0/0 · vitest · rebuilt `donna-web` + live pass over every About page   |
| **PR 2** | `docs/repo-presentation` | README rewrite, LICENSE, acknowledgements, root cleanup, hero screenshot | every README command re-run verbatim · all relative links checked · screenshot renders |

PR 2 branches off `main` **after** PR 1 merges so the README can reference the finished About guide.

**Artifacts-slice interrupt:** the upstream ask for document-grade run artifacts
(`docs/upstream-requests/lq-ai-autonomous-run-artifacts.md`, PR #67) is in flight. If LQ-AI CC
reports the merged SHA mid-milestone, pause at the next task boundary and run that slice as its own
branch/PR (pin bump → `gen:api` → "Documents" block above the findings list in
`RunResults.svelte`), then resume. The About Automations page then gets a one-line touch-up in
whichever docs-polish PR is still open (or a trivial follow-up commit if both have merged).

## PR 1 — About refresh

### Fact-check audit (first task wave)

Dispatch one **read-only fact-check subagent per page** — Overview, Assistant, Projects, Workflows,
Tabular, Knowledge, Models, Trust, LQ-AI, LQ-AI/Build (10 agents). Each agent diffs the page's
claims against the current routes/components (not memory, not specs) and returns a structured
staleness/defect list. The rewrite tasks consume these lists. Rationale: the 2a/2b About loop
caught real defects only via systematic fact-checking; ten pages × every surface shipped since
2026-06-03 is beyond a reliable single-context audit.

### New `/about/automations` page

- Rail entry **after Workflows** (9 entries total) in `src/lib/about/AboutRail.svelte`.
- Prose-page style matching the other rail pages (`max-w-5xl` container from the layout,
  paragraphs `max-w-prose`).
- Content: what autonomous runs are (playbook or skill source + required target KB + optional
  matter); the `autonomous_enabled` opt-in preference and the `AutomationsGate`; run-now;
  schedules (cron); watches (KB document arrival); the receipt page — Activity timeline
  (phases + tool calls), cost, terminal reason; **Results** — emission-ordered findings with
  severity badges and "Memories this run proposed"; notifications inbox; cost caps.
- Same test treatment existing About pages have (smoke/unit per current convention — confirm in
  plan against existing About tests).

### Known content edits (audit may add more)

- **`/about/lq-ai`** — move the "Build & learn with LQ-AI" section (currently the bottom
  `<section>`, lines 22–96) up between the intro paragraph (ends "…verified, cited answer.") and
  the numbered `lqLearnSections` loop ("1. The big picture: System Architecture"). User-specified
  placement, 2026-06-04.
- **`/about/models`** — add BYOK provider-keys coverage: admin-gated card on `/settings/models`,
  masked write-only keys, hot-applied, env-managed rows not revokable.
- **`/about/workflows`** — cross-link the new Automations page; correct anything implying
  workflows are the only automation surface.
- **`/about/tabular`** — ensure ensemble verification is covered.
- All other pages: audit-driven edits only (no speculative rewrites).

### Copy nits (ride along in PR 1)

1. **`src/lib/inference/ProviderKeyRowItem.svelte`** — an env-**defined**-but-empty provider row
   currently renders "No key" (status, line 19) directly above "This key is managed by your
   deployment's environment." (line 50) — faithful but contradictory. Fix: one coherent status
   for that state (e.g. the env note absorbs the empty state: "Defined by your deployment's
   environment, but the variable is empty — set it in the deployment or add a runtime key.").
   Exact copy decided in plan; update `ProviderKeyRowItem.svelte.test.ts` accordingly.
2. **`src/lib/matters/MatterPicker.svelte`** — static `aria-label="Choose matter"` (line 41)
   becomes selection-aware (e.g. `Matter: <name>` when one is selected, "Choose matter"
   otherwise). Update its test.

## PR 2 — Repo presentation

### README rewrite (product-forward)

Structure:

1. **Hero** — what Donna is (friendly legal-AI frontend), powered-by-LQ-AI framing, MikeOSS
   inspiration nod, **hero screenshot** (captured from the live stack via Playwright, stored in
   `docs/images/` so it doesn't ship in the app bundle).
2. **Feature tour** — every shipped surface: assistant chat + character-verified citations,
   document panel, matters + privilege tiers, knowledge bases + ingest, skills + playbooks
   (browse/apply/author), saved prompts, tabular review + ensemble verification, **Automations**
   (run-now/schedules/watches/receipts/results/notifications), redline, settings (account,
   data-privacy, preferences, trust, models + BYOK), prompt enhance, anonymization/audit.
   Brief — a line or two per surface, linking `/about` for depth.
3. **Architecture** — current BFF paragraph survives (it is accurate), lightly edited.
4. **Setup / Run / Verify / Development** — current content kept (it is good and current),
   polished; stale "P0+P1" framing and the dated spec pointer replaced by a pointer to
   `docs/` generally.
5. **Layout map** — updated for current tree.
6. **License** — one line pointing at LICENSE.
7. **Acknowledgements** — MikeOSS inspiration, LQ-AI backend, ending with the verbatim credit:
   > "Donna and LQ.AI were initially authored by Kevin Keller and contributed to LegalQuants.
   > Comments, corrections, and contributions welcomed via GitHub."

### LICENSE + metadata

- `LICENSE` — Apache 2.0 full standard text. Copyright line: **"Copyright 2026 LegalQuants"**
  (flagged at spec review; adjust there if the user prefers naming Kevin Keller too).
- `package.json` gains `"license": "Apache-2.0"`.

### Root cleanup

- `git mv mikeossfrontendscope.md mikeossuxbreakdown.md docs/research/` (preserves history;
  fix any inbound references — README currently doesn't link them, verify nothing else does).

## Out of scope

- Slice D/E (memories keep/dismiss, precedents), scheduled-skill-registry bug recheck,
  source-switch dual-key PATCH ask — all remain backlog.
- A `docs/README.md` index of specs/plans (explicitly declined — debatable value).
- Any `vendor/lq-ai` edits (upstream-ask workflow only).

## Verification summary

- **PR 1:** `npm run check` 0/0 · vitest green (updated nit tests + new-page tests) · no new lint
  errors over the ~55 pre-existing · rebuild `donna-web`, live-browse all 11 About pages
  (10 existing + new Automations) · whole-branch Opus review before PR.
- **PR 2:** run every README command verbatim against the stack · check all relative links ·
  confirm LICENSE text is the unmodified Apache-2.0 standard text · screenshot displays on GitHub
  (relative path) · whole-branch review before PR.
