# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `c4d4482` (bumped 2026-06-07 from `0097b01`)
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.

### Bump log

- `0097b01` → `c4d4482` (2026-06-07): lq-ai **#138** + **#139** (Donna asks **#8** + **#9**,
  migration head → 0047) —
  - **#138 `338579e` — document-grade run artifacts** (ask `lq-ai-autonomous-run-artifacts.md`,
    shape (a)): artifacts persist as **real Documents in the run's `target_kb_id`** (doc-panel /
    download / RAG for free; v1 markdown-only, `mime` pinned `text/markdown` server-side). New
    owner-gated paginated `GET /sessions/{id}/artifacts` → `AutonomousArtifactListResponse`
    (`AutonomousArtifactRead`: `id, name, mime, size_bytes, file_id?, document_id?, created_at`;
    `document_id` read-time-enriched → drives "Open", `file_id` → `/files/{id}/content` Download;
    both SET-NULL on file hard-delete, metadata survives). **Emission is opt-in per automation**:
    `emit_artifacts` (default false) on ScheduleCreate/Update/Read, WatchCreate/Update/Read, and
    `AutonomousManualRunRequest` — REQUIRED (non-optional) in the create/run-now bodies, so Donna
    call sites must pass it. Notification payload now always carries `artifact_count` next to
    `finding_count`. Ordering is `created_at ASC, id ASC` (transaction-stable, NOT emission
    sequence; same tiebreaker retrofitted to findings). Honest fallbacks arrive as ordinary
    findings (opted-in-but-no-KB → one info finding; storage failure → one warn finding per
    artifact). Session delete CASCADEs only the references — the KB documents outlive the session.
    Loop/echo prevention closed upstream (artifacts don't re-trigger watches or next-tick
    analysis). `npm run gen:api` → +183-line additive diff. **Unblocks the artifacts slice**
    (ships with this bump): Documents block in RunResults + opt-in toggles + inbox copy.
  - **#139 `c4d4482` — arq-worker skill registry init** (ask
    `lq-ai-autonomous-skill-registry-init.md`, PR #70): registry bootstrap extracted to
    `app/skills/bootstrap.py::install_skill_registry`, called from BOTH the FastAPI lifespan and
    the arq worker `on_startup`; worker fails loudly at startup if the skills dir can't load.
    Upstream corrections to our ask: (1) never a regression — worker-side `skill_ref` resolution
    never worked on any image (our 06-05 "completed" tick was a `first_tick_no_baseline` baseline
    tick that skips inference); (2) the fix alone wouldn't work in containers — vendor
    `docker-compose.yml` now mounts `./skills:/skills:ro` + sets `LQ_AI_SKILLS_DIR` on
    `arq-worker` (mount is REQUIRED; without it the worker exits at startup by design). The API
    also now fails at startup on a missing/unreadable skills dir (was warn+empty). Donna verifies
    by live `skill_ref` run (no Donna code).
- `fc832ca` → `0097b01` (2026-06-05): lq-ai **#135** (Donna ask `lq-ai-autonomous-run-output.md`) —
  **run findings persisted + readable**: new `autonomous_findings` table (cascade-delete with the
  session) + paginated, owner-gated `GET /sessions/{id}/findings` (limit clamped [1,200],
  `created_at` ASC = emission order; `severity` free-text — intended `info|warn|critical`), plus
  `?source_session_id=` on `GET /memory` ("memories this run proposed"). Precedents deliberately
  NOT session-filterable (recurrence-aggregated) — deferred upstream. `npm run gen:api` → additive
  diff (+99 lines: typed `AutonomousFindingRead`/`AutonomousFindingListResponse` schemas + new
  `/sessions/{id}/findings` path + `source_session_id` query param on `/memory`). **Unblocks the
  run-output-surfacing slice** (this bump ships with it): the "Results" section on
  `/automations/[id]`.
- `35c8bb6` → `fc832ca` (2026-06-05): lq-ai **#133** — `project_id` added to
  `AutonomousScheduleUpdate` AND `AutonomousWatchUpdate`, so a schedule's/watch's **matter is
  reassignable via PATCH** (value → reassign · explicit `null` → unassign · omit → unchanged).
  Caller-owns-the-project now validated (404 `{"detail": "project not found"}`, id-probing-safe via
  `_load_owned_project`) on POST `/schedules`, POST `/watches`, POST `/run-now`, and both PATCHes.
  `npm run gen:api` → ~28-line diff (new 404 responses on POST `/schedules`/`/run-now`, updated PATCH 404 descriptions, and the two Update-schema `project_id` fields). **Unblocks** the
  editable-matter slice (this bump ships with it): editable `MatterPicker` in
  `ScheduleForm`/`WatchForm` edit mode + 404→"matter not found" mapping.
- `541bd6f` → `35c8bb6` (2026-06-04, **recorded retroactively** — bumps shipped mid-slice-F in
  PR #60, in two steps):
  - `541bd6f` → `69a0d35`: lq-ai **#129** — `max_cost_usd` OpenAPI schema-drift fix
    (`AutonomousScheduleCreate/Update/Read` now correctly typed); also includes lq-ai **#128** =
    the **BYOK provider-keys backend** (`/api/v1/admin/provider-keys` CRUD), making the Donna
    BYOK frontend buildable in-pin. (Donna commit `a66f982`)
  - `69a0d35` → `35c8bb6`: lq-ai **#130** — all autonomous session/schedule/watch cost fields
    (`max_cost_usd`, `cost_total_usd`) uniformly typed `string` on the wire to match runtime;
    Donna's defensive `num()` parser already accepted string. (Donna commit `0ea7f9c`)
- `c22360a` → `541bd6f` (2026-06-03): lq-ai **#127** (Donna ask **#6**) — **per-column
  `ensemble_verification` for tabular**. `ColumnSpec` gains `ensemble_verification?: boolean | null`
  (true → routes that column's cells through Stage 4 of the Citation Engine cascade). The cost-preview
  response gains `ensemble_cells_count?` + `ensemble_premium_usd?` (judge-call premium folded into
  `estimated_cost_usd`). Each tabular cell result + its citations now carry `verification_method`
  (string|null: `ensemble_strict` / `ensemble_majority`; null when the column isn't ensemble-verified
  or support wasn't confirmed) — described in the loosely-typed `results` prose (like the `source_*`
  fields, DE-330), so **hand-typed** in `parseTabularResults`. `npm run gen:api` → **+28-line additive
  diff** (ColumnSpec field + cost-preview fields + prose); `npm run check` 0/0. **Unblocks P6-C.1**
  (per-column ensemble toggle) and **closes P6-B.1** (surface `verification_method` on tabular cell
  citations instead of the doc-panel "Unverified" chip). (Prior pin `c22360a` = lq-ai **#125**, P6-B
  navigable tabular cell citations — its bump-log entry was not recorded here.)
- `badf83d` → `945ad31` (2026-06-01): lq-ai #120 (Donna ask **P1.4**) — exposes nullable
  `deletion_scheduled_at` on the `User` object returned by `GET /users/me` (+login/refresh).
  Read-only echo of the existing column (non-null while a grace-period deletion is pending,
  null otherwise); no migration; caller-scoped (no cross-user leak); `test_openapi` stays 114.
  `npm run gen:api` produced a **+5-line additive diff** (the field on the `User` schema only);
  `npm run check` 0/0. **Unblocks** the P7-2 follow-up: replace the always-visible "Cancel
  scheduled deletion" link on `/settings/data` with a conditional "Pending deletion — cancel by
  `<date>`" banner gated on `data.user.deletion_scheduled_at` (this bump ships with that banner).
  Closes the last of the four Donna backend asks (P1.1–P1.4 all landed).
- `438198c` → `badf83d` (2026-06-01): consolidated bump landing all **three** Donna
  backend asks (relay `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`), plus the
  whole `v0.3.1`→`v0.4.0` upstream range:
  - **#115 (DE-328, ask P1.1)** — gateway **skill assembler** now appends _unreferenced_
    bound `skill_inputs` as a labelled context block, so inputs reach the model for
    **non-templated** skills (every built-in), not just `{{placeholder}}`-templated bodies.
    Unblocks Donna's deferred composer skill-input form.
  - **#116/#117 (ask P1.2)** — `MessageCreate.file_ids?: string[]` (Part A) forwarded to
    the gateway as `lq_ai_file_ids` and echoed as `applied_file_ids`, plus file content
    reaching the model verbatim (Part B). Unblocks per-message chat file attachment.
  - **#118 (ask P1.3)** — `PATCH /api/v1/users/me` with a new `UserProfileUpdate` schema
    (display_name edit; email edit deferred → DE-329, #119). Unblocks Settings profile edit.
  - **#119** — files DE-329 (email-edit follow-up) + marks DE-328 resolved (docs).
    Contract delta is **almost entirely additive**: the asks above + the v0.4.0 **autonomous
    workflows** surface (`/api/v1/autonomous/*` — sessions, memory, precedents, schedules,
    watches, notifications, run-now). The only removal across the whole range was a reworded
    preferences-schema comment (no schema removal). Donna consumes none of the _new_ surface
    yet, so `npm run check` is **0/0** against the regenerated contract. **Full local stack
    rebuilt to v0.4.0** (api + gateway + ingest-worker + arq-worker), applying the new
    autonomous-table DB migrations. Verified: check 0/0; full unit suite green; live verified.
    Newly buildable Donna slices: composer skill-input form (P1.1), chat file-attach (P1.2),
    Settings profile-edit (P1.3). The autonomous-workflows API is now available to consume
    (see `docs/roadmap/donna-future-roadmap.md`).
    (Note: this supersedes an intermediate staged bump to `396e19f` for #115 alone that was
    never shipped standalone.)
- `7c7ce14` → `438198c` (2026-05-25): lq-ai #105 **documents** the `/v1/models` alias
  fields to match the live gateway — adds `lq_ai_resolves_to` / `lq_ai_fallback_count`
  to `ModelEntry` and corrects the `routed_inference_tier` description (it's present on
  aliases too, as the primary-resolution tier). Docs-only on the backend (no behavior
  change; the rich model-config capability is untouched). `npm run gen:api` now emits
  both fields on the `/api/v1/models` 200 schema, so Donna's P2c-B1 picker drops its
  hand-typed `RawModelEntry` extension and derives the type from the generated contract.
  Verified: `npm run check` 0/0, model unit + live e2e green. See
  `docs/upstream-requests/lq-ai-models-undocumented-alias-fields.md`.
- `4df3b9b` → `7c7ce14` (2026-05-25): lq-ai #103 fixes the gateway so **streamed**
  completions persist their `inference_routing_log` row (the success-path write was after
  the SSE `[DONE]`, so connection teardown cancelled it). Without it, the P2c Receipts
  drawer + anonymization indicator were blank for UI (streamed) chats. Verified live: a
  streamed turn now yields one inference receipt. `npm run gen:api` produced no type diff.
  See `docs/upstream-requests/lq-ai-streaming-inference-routing-log.md`.
- `8b8e549` → `4df3b9b` (2026-05-24): lq-ai #102 surfaces `anonymization_applied`
  and `message_id` in the receipts `inference`/`error` event detail — the data
  source for Donna's P2c anonymization indicator (the indicator was deferred until
  this landed; see `docs/upstream-requests/lq-ai-expose-anonymization-in-receipts.md`).
  `npm run gen:api` produced no type diff (the receipts `detail` is
  `additionalProperties: true`), but was re-run to confirm.

## Compose bundling mechanism (resolves plan open-question #3)

Donna's `docker-compose.yml` uses top-level `include: [vendor/lq-ai/docker-compose.yml]`
and adds its own frontend as service **`donna-web`**.

- **Why `donna-web`, not overriding `web`:** Compose v2 `include:` does NOT allow
  overriding an imported service name (it errors `services.web conflicts with
imported resource`). So lq-ai's `web` stays in the merged spec under its own name.
- **Avoiding lq-ai's `web`:** bring up an explicit service list that omits it:
  `docker compose up -d --build postgres redis minio gateway api donna-web`.
  Its host port is also parked off 3000 via `WEB_HOST_PORT` as a backstop.
- **Runs alongside a separate lq-ai stack:** project name is `donna` (own network);
  all host ports are shifted via `.env` (see `.env.example`).
- **donna-web healthcheck** uses Node's global `fetch` against `/login` (the
  `node:alpine` image has no reliable `wget`/`curl`).

## First-run admin (for login / e2e)

On first boot the api mints `admin@lq.ai` with a random password (logged at WARNING,
`must_change_password=true`). For a login-ready fixture:

```
docker compose exec api python -m app.cli reset-admin-password \
  --email admin@lq.ai --password '<pw>' --no-force-change
```

## P2a streaming — gateway alias (resolved)

No gateway config change was needed for P2a. The seeded `gateway.yaml` (from
`gateway.yaml.example`) already maps the `smart` alias → `anthropic-prod` /
`claude-opus-4-7`, and `anthropic-prod` reads `ANTHROPIC_API_KEY` (set in the
gitignored `.env`; the compose `gateway` service passes it through). Recreate
the `gateway` container after setting the key (`docker compose up -d
--force-recreate gateway`) so it's in the container env. Streaming verified
end-to-end against Claude Opus 4.7 at Tier 4.

## Known follow-ups

- Upstream lq-ai `backend-openapi.yaml` uses backticks in plain YAML scalars, which
  breaks the codegen parser; `scripts/sanitize-openapi.js` works around it at
  `npm run gen:api` time. Worth an upstream fix (quote those scalars).
- Donna's refresh-cookie TTL is 8h (`REFRESH_TTL_SECONDS`) while lq-ai's refresh
  token default is 7d (`JWT_REFRESH_TOKEN_TTL_SECONDS=604800`) — users re-auth sooner
  than necessary. Consider aligning when chat/session UX lands in P2.
- Reliability (P2 follow-up, from the final review): `hooks.server.ts` treats any
  non-200/403 from `/users/me` (e.g. a 5xx when the api is briefly down) as
  logged-out, and `auth.login` collapses a 500 into "invalid credentials". Both
  should distinguish "auth invalid" from "backend unavailable" (surface a 503)
  rather than silently logging users out / mislabeling outages.
