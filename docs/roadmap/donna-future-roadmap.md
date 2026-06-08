# Donna — future roadmap

Forward-looking: what's deferred, upstream-blocked, or worth doing next — with enough context to
pick up cleanly. For **what shipped**, see [../../CHANGELOG.md](../../CHANGELOG.md) and the in-app
**/about** guide; for **how to build**, see [../../CLAUDE.md](../../CLAUDE.md).

**As of v0.1.0 (2026-06-07), the planned product is complete.** Assistant, Matters, Knowledge, the
full Workflows hub (Skills + skill-inputs form, Playbooks in three authoring modes, Saved Prompts,
and the **Automations** segment with document-grade artifacts), Tabular review (with ensemble
verification), and Settings (incl. BYOK provider keys, profile edit, data export/deletion) have all
shipped. The original `autonomous-workflows-scope.md` in this folder is now **historical** — that
segment is built.

The items below are the genuine remainder.

---

## Upstream-blocked (need an lq-ai change first)

File/extend the ask in `docs/upstream-requests/`, the human relays it, then bump the pin and build
the consuming slice (workflow in [../../CLAUDE.md](../../CLAUDE.md) §8).

- **Richer run artifacts** — v0.1.0 artifacts are markdown/plain-text, rendered inline. PDF/DOCX
  artifact rendering is upstream **DE-332**; artifact **editing/versioning** is out of scope upstream.
  Donna's doc panel already has the seams (PDF render + `TextViewer`) to consume richer types when
  they land.
- **Matters depth** — folder tree, file versions, and project sharing/ACL are absent from the
  generated types. No upstream request written yet; lowest priority. Would need a contract first.
- **Schedule/watch source-switch dual-key** — editing a schedule/watch and switching source
  (playbook ↔ skill) PATCHes the new key without nulling the other, so a row can hold both
  `playbook_id` and `skill_ref`. Unfiled; file an upstream ask to null the inactive key on switch
  (or have the backend treat the two as mutually exclusive on update).
- **Anonymization-config visibility** — no user-facing privacy-posture endpoint; the Trust page uses
  `GET /inference/tier-config` + `/inference/current-tier` today. A future ask could expose the
  active anonymization configuration directly.
- **Deeper autonomous control** — the autonomous runtime currently supports only `halt` (no
  human-in-the-loop pause/resume mid-run). If upstream adds a `needs_input` status + a resume
  endpoint, Donna's receipt/poll chain can surface an approval step.

## Buildable now (no backend dependency)

- **Automations polish** (cosmetic, tracked from PR #72 review): the precedents list caps at 50 with
  no "N of M" indicator; a `pattern_kind` named like a memory state picks up that state's chip color;
  "Proposal created below." can render above a failed proposals section. Small, isolated fixes.
- **Workflows route consolidation under `/workflows/*`** — deliberately avoided (top-level routes
  kept to dodge churn). Revisit only if the flat `/skills`, `/playbooks`, `/prompts`, `/automations`
  routes prove confusing; it's a redirect + nav exercise, not a feature.
- **Feature screenshots** — v0.1.0 ships the hero image only. Adding shots of the Automations
  receipt (with a document), the Tabular grid, and a redline view to the README/About would polish
  the public presentation. Drive the live stack to capture; reference from `docs/images/`.

## When new LQ-AI capabilities land

The backend is actively developed; new surfaces will appear in the OpenAPI contract. To consume one,
**start with the brainstorming skill** (it's a fresh feature) and confirm the contract first. The
closest analogs to mirror are how Donna consumed **Playbooks** (list → detail → `execute` → poll
`executions/{id}` → typed `results`) and **Automations** (run → poll session → typed receipt +
results threaded through the page chain). Checklist to verify against the generated types
(`npm run gen:api`) before designing the surface:

1. **Discover** — list/detail endpoints; built-in vs user-owned distinguishable (`created_by IS NULL`).
2. **Trigger** — what a run/apply operates on (a matter? a `target_document_id`? a prompt?).
3. **Inputs** — typed + required flags in OpenAPI so a form can render (and ideally enforced
   server-side — the skill-inputs no-op bit us once).
4. **Status** — an explicit enum on a pollable resource, or an SSE stream.
5. **Transparency** — step/tool/citation detail (`cited_chunk_ids` → doc-panel citations); core to
   Donna's thesis. A flat final answer undersells it.
6. **Results/artifacts** — final shape + stable links to anything created.
7. **Access control** — who can run built-ins? (Playbooks `execute` is admin-or-owner, which forced
   an Apply gate; flag early.)
8. **Worker/runtime** — which queue (e.g. arq); Donna's dev stack must start the service.
9. **OpenAPI** — everything in the spec so types derive from the contract, not hand-typing.

Then build via the usual loop: brainstorm → spec → plan → subagent-driven execution → whole-branch
review → PR.
