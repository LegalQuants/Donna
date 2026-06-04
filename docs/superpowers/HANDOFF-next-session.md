# Donna — Handoff for the next session

**Date:** 2026-06-04 · **Pin:** `vendor/lq-ai` @ `541bd6f` · **`main`:** all of the 2026-06-03/04 session is merged.

## Status: the entire planned roadmap is SHIPPED ✅
P0–P7, P6 Tabular A–C **+ C.1**, model/inference settings, and the **complete About page** (8-topic guide + the full "Powered by LQ-AI" mirror: How It Works + How to Build + all 18 playgrounds) are all on `main`. This session's 6 PRs (#52 enhance-on-landing · #53/#55/#56 About · #54 model-settings polish · #57 tabular ensemble verification, which also closed P6-B.1) are **all merged**. `npm run check` 0/0; `npx vitest run` ≈ 925 green; pin `541bd6f`.

There is **no unblocked, already-planned feature work pending.** Two forward options, both detailed below.

---

## Option 1 — Provider keys / BYOK (the one open ask; UPSTREAM-BLOCKED on a SHA)
Donna's only outstanding planned item. The provider-keys card on `/settings/models` is a pin-gated stub (currently an "env-only" note). It needs a backend runtime key-management API that **does not exist yet**.

**Upstream request (dispatched, awaiting SHA):** `docs/upstream-requests/lq-ai-provider-key-management.md`. The asked-for contract (admin-only, gateway stays the secret boundary, secrets never returned):
- `GET /api/v1/admin/provider-keys` → `{ provider, type, configured, last4?/fingerprint?, source: 'env'|'runtime' }[]`
- `POST /api/v1/admin/provider-keys` `{ provider, api_key }` (encrypted at rest, hot-applied, no restart)
- `PATCH /api/v1/admin/provider-keys/{provider}` (rotate) · `DELETE …/{provider}` (revoke runtime key; env keys not removable)

**When the user sends the SHA — exact steps:**
1. Branch off `main`; `cd vendor/lq-ai && git fetch && git checkout <sha>`; back in root `npm run gen:api`; rebuild `api gateway` (+ workers if needed); update `docs/decisions/lq-ai-pin.md` bump log; commit the pin bump.
2. **Verify the real endpoints/schemas** in the regenerated `src/lib/api/backend.d.ts` (the shapes above are the *ask*, not guaranteed — confirm names/fields).
3. Build the provider-keys **card** on `/settings/models` (Task 5 of `docs/superpowers/plans/2026-06-03-model-inference-settings.md`): per-provider masked status (configured/last4/source), an add/rotate key flow (`type="password"`, write-only — never display/store the secret), delete for runtime keys, admin-gated (non-admin read-only, mirroring the `?/reassign` pattern in `src/lib/inference/CategoryRow.svelte` + `settings/models/+page.server.ts`). Reuse Donna's settings-modal + secret-input precedents.
4. Live e2e (rebuild `donna-web`): admin adds/lists/deletes a runtime key; non-admin sees read-only.

Run the normal loop (brainstorm→spec→plan→subagent-execute→whole-branch Opus review→PR).

## Option 2 — Autonomous-workflows surface (buildable NOW, no SHA needed; mostly)
The planned **4th Workflows segment** over LQ-AI's `/api/v1/autonomous/*` (shipped v0.4.0, typed at the current pin). Full scope + slicing + effort + unknowns are in memory **[[donna-autonomous-workflows-scope]]** (and `docs/roadmap/donna-future-roadmap.md`). Highlights:
- **Clean extension of the Workflows IA**, not a re-architecture. Runs **POLL, not SSE** → reuse `src/lib/{playbooks/runFlow,tabular/runPoll}.svelte.ts`. ~8 slices (~1 L + 4 M + 3 S).
- **Start with Slice A — read-only Sessions + receipt view** (the transparency payoff): no opt-in, no cron, no mutate. Main work = hand-typing the loosely-typed `receipt` blob (`backend.d.ts:9155`) — **spike: capture a real `GET /sessions/{id}` receipt first**.
- **Blocker for the *mutate* slices (run-now/schedules/watches):** they 403 until a per-user `autonomous_enabled` flag is on, and **there's no endpoint in the autonomous surface to set it** — resolve where a user enables it (likely a `/settings` or users endpoint, possibly an upstream ask) before committing to those slices. Read-only A + B (notifications) need no opt-in.

If pursued, it gets its own brainstorm→spec→plan loop per slice.

---

## Dev-stack reminders (see [[donna-dev-stack]])
- Shifted ports. Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App: http://localhost:13002 · API: :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`.
- **Rebuild `donna-web` before FE e2e; rebuild api+gateway+arq-worker+ingest-worker on a pin change.** `.txt` won't ingest — use a `.pdf` fixture.
- Gate: **`npm run check` = 0/0** is THE bar (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npm run lint`/`npx eslint .` has **~53 PRE-EXISTING errors on `main`** — add no NEW ones (use `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on internal/dynamic `<a href>`; static external https links don't need it). `npx vitest run` ≈ 925 green.
- **Loosely-typed backend fields** (`additionalProperties`, DE-330) aren't emitted by `gen:api` — hand-type + parse them (precedents: tabular `source_*`/`verification_method`; the autonomous `receipt`).

## The build loop (worked well all session)
brainstorm → spec → plan → **subagent-driven execute** (fresh Sonnet/task, full task text, per-task spec + code-quality review, fix→amend) → **whole-branch Opus review** → `finishing-a-development-branch` → PR. The whole-branch Opus review repeatedly caught real issues (the `$app/forms` `enhance` shadowing; the Knowledge "sidebar" content defect; the stale Trust-page copy after the ensemble GREEN change). For content-heavy work: parallel write-only content agents + one consolidated Opus fact-check. Upstream-pin pattern: bump submodule → `gen:api` → rebuild → verify live → update `docs/decisions/lq-ai-pin.md` → commit on the phase branch.

See memories: [[donna-phase-status]] [[donna-autonomous-workflows-scope]] [[donna-model-inference-settings]] [[donna-about-page]] [[donna-enhance-on-landing]] [[donna-workflow]] [[donna-dev-stack]] [[donna-product-direction]] [[donna-citation-contract]] [[donna-reviewer-remote-hygiene]].
