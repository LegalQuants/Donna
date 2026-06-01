# Donna — future roadmap (deferred / not-yet-buildable)

Things intentionally pushed beyond the current build queue, with enough context to pick up cleanly
later. This is **forward-looking** — see the `donna-phase-status` project memory for what's shipped.

---

## Autonomous workflows (deferred 2026-05-31)

**Status:** waiting on the LQ_AI backend. The backend's *autonomous workflows* (multi-step agentic
flows) are being built as part of LQ_AI **Milestone 4**. Donna will expose them once that lands and
the `vendor/lq-ai` pin is bumped. The unified **Workflows** area (shipped in #31 — hub + segmented
sub-nav `Skills · Playbooks · Prompts`) was deliberately built to **extend** to this: an autonomous
workflows surface is the natural fourth tool/segment ("Workflows"/"Automations").

**Why deferred:** no contract yet — can't spec the Donna surface until the backend API exists.

### When it lands — start with the brainstorming skill (fresh feature)

This is the consumer-side checklist to confirm against the *new* contract before brainstorming the
surface. Our closest analog is how Donna consumed **playbooks** (list → detail → `execute` → poll
`executions/{id}` → typed `results`), so mirror that shape unless the contract differs.

Contract requirements to verify (`npm run gen:api` then check the generated types):
1. **Discover** — list + detail endpoints for available autonomous workflows (built-in vs user-owned
   distinguishable, like skills/playbooks `created_by IS NULL`).
2. **Trigger** — a `run`/`execute` endpoint; what does a run operate on? a matter? a document
   (`target_document_id`, like playbooks)? a free prompt? a chat? (Drives the whole UI.)
3. **Inputs schema** — reuse the `skill_inputs` taxonomy (`text`/`document`/`structured`) or new?
   Exposed in OpenAPI with types + required flags so the form can render (and ideally enforced
   server-side — the skill-inputs no-op bit us once).
4. **Status model** — explicit enum (e.g. `pending`/`running`/`needs_input`/`completed`/`failed`/
   `cancelled`) on a pollable execution resource, **or** an SSE stream. (Polling matches existing
   patterns; SSE is nicer for live agent progress.)
5. **Step-level transparency** *(core to Donna's product thesis)* — expose the run's steps/actions:
   which tool/skill each step invoked, an input/output summary, citations (`cited_chunk_ids` so we can
   wire doc-panel citations like playbooks), timestamps. A flat final answer undersells it.
6. **Human-in-the-loop** — does a run pause for approval/input mid-flight? If so we need a
   `needs_input` status + the pending decision payload + a **resume** endpoint.
7. **Cancellation** — cancel an in-flight run.
8. **Results / artifacts** — final output shape + stable links to anything created (documents,
   redlines, a chat, a playbook).
9. **Access control** — who can run built-ins? Playbooks `execute` is **admin-or-owner only**, which
   forced an Apply gate for non-admins; flag early if autonomous runs share that constraint.
10. **Worker/runtime** — which queue runs these (arq, like easy-gen's `arq:m3a6`)? Donna's local dev
    must start the service (we already run `arq-worker` + `ingest-worker`).
11. **OpenAPI** — everything in the generated spec so types derive from the contract (not hand-typed).

Build via the usual loop: brainstorm → spec → plan → subagent-driven execution → whole-branch review → PR.

---

## Other deferred items

- **Skill-inputs composer form** — upstream-blocked: `skill_inputs` is a no-op for built-in skills.
  Request: `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-skill-inputs-corpus.md`. Build
  after the backend fix + pin bump.
- **Chat-level file attach** — upstream-blocked: `MessageCreate` has no `file_ids`. Request:
  `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-chat-message-file-attach.md`.
- **P7 profile editing (display_name / email)** — upstream-blocked: no `PATCH /api/v1/users/me`.
  Request: `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-patch-users-me-profile.md`. The
  *rest* of P7 (profile view, preferences, password, export, deletion, Trust/tier page) is buildable
  now without any backend change.
- **P7 plan/subscription display** — N/A: no billing concept in lq-ai (self-hosted).
- **P7 anonymization-config visibility** — no user-facing privacy-posture endpoint today; possible
  future upstream ask (Trust page uses `GET /inference/tier-config` + `/inference/current-tier` for now).
- **P4 matters depth** — folder tree, file versions, project sharing/ACL: absent from the generated
  types at P4 recon; no formal upstream request written yet (would need one). Lowest priority.
- **Workflows route consolidation under `/workflows/*`** — deliberately avoided in #31 (top-level
  routes kept to dodge churn); revisit only if the flat routes prove confusing.

---

## Near-term buildable now (no backend dependency) — for sequencing reference

Per the 2026-05-31 backend-readiness recon: **P8 redline pane** (frontend-only; `RedlineBlocks.svelte`
is the seed), **P7 supported sub-features** (everything except profile-edit), and **P6 Tabular**
(full backend support at `/api/v1/tabular/*`; the largest frontend build) are all doable without an
LQ_AI change. Suggested order: P8 → P7 → P6.
