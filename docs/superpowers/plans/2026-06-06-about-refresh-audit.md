# About-refresh fact-check audit — 2026-06-06

Ten read-only agents diffed each About page against the current code (Task 1 of
`2026-06-06-about-refresh.md`). Findings below; dispositions are added in Task 9
(`(fixed)` / `(covered: Task N)` / `(waived: <reason>)`).

## src/routes/(app)/about/overview/+page.svelte

- [severity: stale] Workflows described as "skills, playbooks, and saved prompts" — the hub now
  also contains Automations (evidence: src/lib/workflows/WorkflowsNav.svelte:5-10)
- [severity: gap] The reading-path paragraph ("Start with the Assistant page… work through
  Projects, Workflows, and Tabular… Knowledge, Models, and Trust & citations") doesn't mention the
  new Automations rail page (evidence: src/routes/(app)/about/overview/+page.svelte:39)
- [severity: wrong — APP BUG, not page copy] `Sidebar.svelte` Workflows `match` array is
  `['/workflows', '/skills', '/playbooks', '/prompts']`, omitting `/automations` — the Workflows
  sidebar item doesn't highlight while on automations pages (evidence:
  src/lib/components/Sidebar.svelte:13; verified by controller)

(The agent also flagged "Start with Assistant but Overview is first in the rail" — rejected:
the Overview page IS the page telling you where to go next; no self-contradiction.)

## src/routes/(app)/about/assistant/+page.svelte

- [severity: gap] File upload status states listed as "uploading", "ready", or "failed" — the
  implementation has five: uploading, pending, processing, ready, failed (evidence:
  src/lib/files/types.ts:11, src/lib/files/fileAttach.svelte.ts:66-67)

## src/routes/(app)/about/projects/+page.svelte

No defects.

## src/routes/(app)/about/workflows/+page.svelte

- [severity: stale] "One sidebar entry opens a hub with three tabs — Skills, Playbooks, and
  Prompts" — the hub has four tabs incl. Automations (evidence:
  src/lib/workflows/WorkflowsNav.svelte:5-10) (covered: Task 7)

## src/routes/(app)/about/tabular/+page.svelte

- [severity: gap] Ensemble verification not covered (column checkbox, cost-preview premium line,
  ✓ Verified chip) (covered: Task 8)

## src/routes/(app)/about/knowledge/+page.svelte

- [severity: gap] The KB file row shows a "Download" link for attached+ready files; the page
  doesn't mention it (evidence: src/lib/kb/KbFileRow.svelte:109-112 — re-verify exact path)

## src/routes/(app)/about/models/+page.svelte

- [severity: wrong] "they are not entered or edited in the Donna UI" + "contact whoever manages
  your Donna deployment" — BYOK shipped: admin-gated Provider keys card with Add/Replace key,
  hot-applied (evidence: src/lib/inference/ProviderKeysCard.svelte,
  src/lib/inference/ProviderKeyRowItem.svelte:54-71) (covered: Task 6)
- All other claims verified accurate (three-section structure, picker filtering, tier-floor
  promotion, local models card).

## src/routes/(app)/about/trust/+page.svelte

No defects. (Citation colors, receipts drawer event kinds/fields, anonymization badge, disclaimer
placement all verified accurate.)

## src/routes/(app)/about/lq-ai/+page.svelte

- [severity: gap] "The same backend that powers Donna's chat, playbooks, tabular review, and
  knowledge retrieval" omits automations — now a shipped Donna surface (evidence:
  src/routes/(app)/about/lq-ai/+page.svelte:31, src/lib/about/lqLearnSections.ts:124-142)
- lqLearnSections.ts content + all playground iframes verified accurate/present.

## src/routes/(app)/about/lq-ai/build/+page.svelte

- [severity: wrong?] Page says runs emit `autonomous.execute` + `autonomous.tool_call` spans; the
  vendored alignment guide documents `autonomous.session` (evidence:
  vendor/lq-ai docs/LQVern/agentic-flow-alignment-guide.md:169 vs api/app/autonomous/executor.py:121).
  NOTE: the page matches the *implementation*; the guide is what diverged.
- [severity: gap] Audit-action list "phase_transition / tool_call / halted / cost_cap_reached /
  completed" omits "started" (evidence: vendor/lq-ai api/app/autonomous/audit.py:39-54)
