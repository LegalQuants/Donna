# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `44a1de54` (bumped 2026-07-04 from `e40b98c`)
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.

### Bump log

- `e40b98c` → `44a1de54` (2026-07-04): lq-ai **#273 — runtime tool/authority-provider admin API**
  (v0.6.x) — resolving Donna upstream ask `docs/upstream-requests/lq-ai-tool-provider-admin-config.md`
  and unblocking the in-app **Research sources** admin card. New admin surface (all `AdminUser`-gated,
  secrets write-only, hot-applied, audit-logged): `GET /api/v1/admin/tool-providers` →
  `{tool_providers:[{type, enabled, name, has_key, key_required, egress_tier}]}`; `POST …` body
  `{type, api_key?}` (enable + optional key); `PATCH …/{provider_type}` body `{api_key?, enabled?}`
  (rotate/toggle); `DELETE …/{provider_type}` → 204 (disable). `type ∈ {courtlistener, govinfo, edgar,
eurlex}`; `key_required` true for CL/govinfo, false for edgar/eurlex. Bodies are `extra="forbid"`
  (can't set base_url/allowlist — gateway-owned SSRF boundary). Errors: 400 = gateway master key unset;
  404 = unknown type; 409 = env-configured entry ("edit gateway.yaml"). **DE-383 gotcha:** use
  `GET /admin/tool-providers` for authoritative admin status, NOT `/research/sources` (the latter derives
  `enabled` from entry presence and lags a mid-toggle disable).

  **⚠️ OpenAPI-export migration finding (Donna-side, important):** the new routes are NOT in the
  hand-maintained `vendor/lq-ai/docs/api/backend-openapi.yaml` — DE-373 introduced a **separate
  code-generated export** `docs/api/backend-openapi.generated.yaml` that carries them. **We did NOT
  migrate `gen:api` to it:** the generated export uses FastAPI's **module-qualified schema names**
  (e.g. `app__schemas__knowledge__AttachFileRequest` instead of `File`/`SkillSummary`), so pointing
  `gen:api` at it regenerates a ~22k-line `backend.d.ts` and breaks **85** existing type references
  across tabular/models/trust/knowledge. So `gen:api` still reads the hand-maintained sketch (type
  surface unchanged, check 0/0), and the 4 tool-provider endpoints are **hand-typed** in
  `src/lib/research/toolProviders.ts` (defensive-parser precedent: `providerKeys.ts`/`ledger.ts`).
  **Follow-up:** migrating Donna to the generated export (and reconciling the ~85 renamed schemas) is a
  separate, tracked effort — until then, new backend routes remain invisible to typegen and must be
  hand-typed. Reference UI shipped by LQ-AI at
  `vendor/lq-ai/web/src/routes/lq-ai/admin/research-sources/+page.svelte`.

- `5aa9135` → `e40b98c` (2026-07-03): lq-ai **#266 — cross-user auditor/compliance role** —
  resolving Donna upstream ask `docs/upstream-requests/lq-ai-cross-user-auditor-role.md` and
  unblocking the fiduciary segment's **reviewer-facing half**. New Donna-facing contract in
  `backend.d.ts`: the `users.role` enum gains **`auditor`** (migration 0065) across `UserOut`,
  `UserProfile`, and `PATCH /api/v1/admin/users/{user_id}/role` (grant via the same admin endpoint
  used for viewer/member; `is_admin` stays `false`). The role is a **read-only, deployment-wide
  privileged reader** — the set `{admin, auditor}` may now cross-user read `GET /chats/{id}/ledger`,
  `…/messages/{id}/sources`, `GET /autonomous/sessions/{id}/ledger`, and `…/receipts[.export.jsonl]`
  for **another user's** work (previously 404 even to admin on the ledger endpoints). **Note: the
  authz change is runtime-only — no endpoint _shape_ changed**, so the ledger/session-ledger/sources
  response types are unchanged; only the enum widened. Failure matrix (from §2.6a of the integration
  doc): owner → 200 (no audit row); privileged non-owner → 200 **+ one `audit_log` row**
  (`action ∈ {auditor.ledger_viewed, auditor.sources_viewed, auditor.session_ledger_viewed,
auditor.receipts_viewed, auditor.receipts_exported}`, `details.viewed_user_id` = owner);
  member/viewer non-owner → 404 (ledger/sources/session, existence-safe) or 403 (receipts);
  nonexistent id → 404. **Out of scope (be honest in the UI):** no cross-user listing/discovery
  (read by known id only), no per-matter/per-org scoping (single global role), writes stay
  owner-scoped. Global read-only _enforcement_ of the role beyond the 5 listed endpoints is LQ-AI
  **DE-378** (unwired MutatingUser gate; writes safe via owner-scoping regardless). Ask #2 (signed
  attestation export) was **deferred by LQ-AI as DE-379** — its reviewer variant will compose on this
  auditor role when picked up. **This bump also pulls in the intervening backend work on lq-ai main:**
  SEC **EDGAR** authority source (#254), **EUR-Lex** get-by-CELEX (#257), a code-generated OpenAPI
  export plus CI drift-guard (#255, closes DE-373), a claims-vs-reality honesty audit (#260), and the
  fiduciary Learn playgrounds (#262). EDGAR + EUR-Lex now appear in `GET /research/sources` (verified
  live: 4 sources, `edgar`/`eurlex` both `enabled:false` until operator keys are set) and render
  through the data-driven `ResearchSourcesCard` unchanged. Authoritative reference:
  `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` **§2.6a**.

- `5ad9f9e` → `5aa9135` (2026-07-01): lq-ai **WS-E/WS-D fiduciary-grade auditability** — unblocking the
  Donna fiduciary segment (citation ledger, fiduciary gate, provenance, caselaw + authority
  verification, case treatment, autonomous-session ledger, research source registry). Contract:
  chat/session ledger `GET /chats/{id}/ledger` + `GET /autonomous/sessions/{id}/ledger` (identical
  `{entries[], gates[]}`; `gate_status` ∈ `fiduciary_grade|supported_only|flagged`; **typed as
  `LedgerEntry` for shape, but the runtime handlers return `dict[str,Any]` — shape-accurate, not
  runtime-validated, so parse defensively**), provenance `GET /chats/{id}/messages/{id}/sources`, and
  the typed research registry `GET /research/sources` → `SourcesResponse`/`AvailableSourceResponse`.
  Migrations 0057–0064. The initial fiduciary code shipped on `3659360` (#251/#252), but its committed
  OpenAPI **sketch was stale** (missing `/research/sources` and `/autonomous/sessions/{id}/ledger`) —
  see `docs/upstream-requests/lq-ai-openapi-export-staleness.md`; fixed in **PR #253 (`5aa9135`)**,
  which is why we pin here. LQ-AI filed **DE-373** (code-generated export + CI drift-guard) so the
  sketch can't silently drift again. Authoritative reference:
  `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md`.

- `658fdbc` → `5ad9f9e` (2026-06-23): lq-ai **#211 — opt-in sticky-skills toggle** — unblocking
  Donna's per-chat **"Keep skills on"** feature. New Donna-facing contract in `backend.d.ts`:
  migration `0056_chat_sticky_skills` adds `chats.sticky_skills text[]`; the Chat response exposes
  **`sticky_skills?: string[]`** (so the client reflects the toggle on load); the message-create
  request gains **`set_sticky: boolean | null`** (`true` = snapshot this turn's effective skills as the
  sticky set, `false` = clear, `null`/omitted = unchanged). Donna sends `set_sticky` only when the user
  flips the toggle and never sends `null` (omits instead). Verified post-`gen:api`: check 0/0.

- `97ccbc0` → `658fdbc` (2026-06-20): lq-ai **PR6 series (WS5 transparency)** — **#188 (PR6a)** +
  **#189 (PR6b)** + **#191 (PR6c)** + **#192 (PR6d)** — unblocking Donna **Slice D**
  (transparency / external-source citations). PR6e is image-packaging only (not yet cut). New
  Donna-facing contract in `backend.d.ts`:
  - **PR6c — external-source citations.** `GET /api/v1/chats/{chat_id}/messages/{message_id}/sources`
    → `ToolSource[]` (`{ id, message_id, source_kind, label, subtitle?, url?, external_ref?,
provider, tool, created_at }`, all fields optional in the schema → **hand-parse** with a
    defensive `parseToolSources` per §2). `source_kind` is `'caselaw'` in 6c (extensible to `'mcp'`
    per lq-ai DE-350). Backed by new table `message_tool_sources` (migration head → **0055**);
    retrieval-provenance ("sources consulted"), NOT marker-grounding — distinct from
    `message_citations` (verified quotes). lq-ai shipped a full reference UI in their own `web/`
    package (`ProvenancePill` caselaw kind + `ToolSourcesPanel` + lazy-fetch in `MessageBubble`) —
    the design blueprint for Donna's surface.
  - **PR6d — skill tool-usage (C5).** `Skill` (detail) schema gains `tool_usage?: string[] | null`
    (connectors the skill declares it uses) and `unavailable_tool_usage?: string[] | null`
    (declared connectors not configured in this deployment; informational, never gating). NB: these
    are on `Skill` (detail) only, **not** `SkillSummary` (list) in Donna's OpenAPI — design the
    surface on the skill-detail page. New built-in `case-law-research` skill ships with
    `tool_usage: [courtlistener]`.
  - **PR6a/6b** are lq-ai-side narrative + their own reference chat UI (no new Donna contract;
    Donna's Slice C already shipped the equivalent chat tool-loop UI).
  - **Runtime: rebuild `api` + workers + `gateway` + `donna-web` so migration 0055 runs.** Pin
    bump committed as the Slice D branch's FIRST commit (not riding the working tree this time).

- `6a6e83e` → `97ccbc0` (2026-06-19): lq-ai **#181 (PR5a)** + **#187 (PR5b)** — the **governed chat
  tool-loop** (WS4), unblocking Donna **Slice C**. PR5a added the tool-governance substrate +
  `retrieve_caselaw`/`call_mcp_tool` autonomous tool intents (`tool_call_log`); PR5b added the chat
  tool-loop + **persist-and-resume confirmation gate** (migration head → **0054** `chat_pending_tool_
call`). New Donna-facing contract in `backend.d.ts`: `POST /api/v1/chats/{chat_id}/tool-calls/
{pending_call_id}` (`ToolCallDecisionRequest { decision: "approve"|"deny" }` → SSE resume; 404/409/400).
  The two new chat SSE frames (`tool_confirmation_required`, `mcp_authorization_required`) are streaming
  payloads (not in OpenAPI) — Donna hand-types them in `src/lib/chat/sse.ts`. Tool rounds run
  non-streaming server-side (no inline tool frames). **Runtime: rebuild `api` + workers + `gateway` (the
  tools passthrough) + `donna-web` so migration 0054 runs.** NB: this pin bump was committed late (it
  rode the working tree uncommitted through the Slice C branch and was committed directly to `main` after
  the PR #88 merge — the frontend never depended on the regenerated types, so the slice still built/tested
  on 97ccbc0). Connect-on-demand requires a registered OAuth MCP client to exercise end to end.

- `786801a` → `6a6e83e` (2026-06-18): lq-ai **#172 (PR4d)** — the **per-user MCP OAuth UX surface**,
  unblocking Donna **Slice B2**. Bundles the three Donna asks
  (`docs/upstream-requests/lq-ai-mcp-oauth-donna-surface.md`), all verified in `backend.d.ts`:
  - **Q1** — `GET /api/v1/mcp/oauth` (`ActiveUser`) → `MCPOAuthServersResponse { servers:
[{ server, connected, scopes, expires_at }] }`. The per-user, list-shaped sibling of the existing
    single-server `/status`; no token bytes returned.
  - **Q2** — `GET /api/v1/mcp/oauth/{server}/authorize` now takes an optional **`return_url`** query,
    validated against `lq_ai_cors_origins` (`is_allowed_return_url`, fail-closed on empty). Stored on
    the `mcp_oauth_state` row (migration **0052**); the public callback **302s the browser** to
    `{return_url}?mcp_connected={server}` (success) / `?mcp_error={code}&server={server}` (error),
    preserving any `#fragment`; absent → today's 200 JSON (back-compat). The one change that makes the
    OAuth round-trip fit Donna's BFF.
  - **Q3** — `MCPServerView.auth: "none" | "bearer" | "oauth"` (read from `get_admin_config`) so the
    admin `/settings/mcp` page can label OAuth servers.
  - **Runtime:** migration head → **0052**; rebuild `api` + workers + **`gateway`** (PR4d is
    security-gated/gateway-touching) + `donna-web`. For **live OAuth testing** the api needs
    `LQ_AI_MCP_MASTER_KEY` (Fernet; lazy — api boots without it) and `LQ_AI_CORS_ORIGINS` to include
    Donna's origin (`http://localhost:13002`) so `return_url` validates. Connect-on-demand SSE
    (`mcp_authorization_required`) is PR5b (Slice C).

- `8142d58` → `786801a` (2026-06-17): lq-ai **#167** — `/research/search` now **accepts a `cursor`**,
  unblocking Donna **Slice A pagination** ("Load more"). The ask
  (`docs/upstream-requests/lq-ai-research-search-cursor.md`) was honored end-to-end: `SearchRequest`
  gains `cursor: str | None` (still `extra="forbid"`), the search service forwards it to the gateway
  tool call, and the CL adapter sets CourtListener's native `?cursor=` param. `next_cursor` already
  returned the right value; this lets a client send it back to page forward. **OpenAPI verified, no
  drift** — the inline `/api/v1/research/search` request body in `backend.d.ts` now carries
  `cursor?: string | null` ("Opaque pagination cursor from a prior response's next_cursor"). No
  migration in this PR (search is stateless REST); a container rebuild is still good hygiene before a
  live check so the pinned backend matches.

- `e2cc311` → `8142d58` (2026-06-17): the **MCP client / WS2** surface, unblocking Donna **Slice B**
  (MCP admin config `/settings/mcp`). Bundles lq-ai **#165 + #166**:
  - **#165 `5b73e75`** — gateway MCP tool-provider adapter (`streamable_http`, per-call OAuth token,
    tool discovery) behind the WS1 egress boundary. Pure gateway/backend — no Donna surface.
  - **#166 `8142d58`** — the api MCP registry + discovery cache + **`/api/v1/admin/mcp`** surface
    (migration **0050** `mcp_tools`). **AdminUser-gated**, cleanly typed (named schemas, no OpenAPI
    drift this time — verified in `backend.d.ts`): `GET /admin/mcp` →
    `MCPServersResponse { servers: MCPServerView[] }`; `POST /admin/mcp/{server}/refresh` →
    `MCPRefreshResponse`; `PATCH /admin/mcp/{server}/tools/{tool}` `{enabled}` → `MCPToolView`
    (`{ name, description?, parameters?, read_only, destructive, requires_confirmation, enabled }`).
    No connector-creation/auth UI (operator `mcp.yaml`); in-chat tool-calling + confirm gate is Slice C.
    **Container rebuild before runtime/e2e** (§8): rebuild `api`+workers+`donna-web` so migration 0050 runs.

- `c4d4482` → `e2cc311` (2026-06-17): the **legal-research WS3 / CourtListener** surface, unblocking
  Donna **Slice A** (case-law research workspace). Bundles lq-ai **#158–#164**:
  - **#161 `dac1f3f`** — the `/api/v1/research/*` API surface (migration head → **0049**,
    `research_metadata`): `POST /verify-citations`, `POST /search`, `GET /clusters/{id}`,
    `GET /opinions/{id}` (full opinion plaintext), `POST /find-in-case`. Plain synchronous REST.
  - **#163 `38dbbb0` + #164 `e2cc311`** — the three Donna-requested refinements
    (`docs/upstream-requests/lq-ai-research-surface-donna-refinements.md`), now reflected in the
    consumable OpenAPI spec and verified in `backend.d.ts`: - `GET /research/capabilities` → `{ enabled: boolean, providers: [{name, type}] }` — fresh from
    the gateway (no api restart), so Donna's not-enabled gate is deterministic; the other endpoints
    raise **503 `ResearchNotConfigured`** when off. - Typed `VerifiedCitation` (`citation, normalized_citations[], status, error_message,
clusters:[{id, case_name, absolute_url}]`) — Donna drops the planned hand-parser. - `text_field_used` is a **7-member enum** (`html_with_citations`, `html_columbia`,
    `html_lawbox`, `xml_harvard`, `html_anon_2020`, `html`, `plain_text`).
  - Note: multi-CourtListener-provider configs resolve to `providers[0]` (process-cached). LQ-AI
    filed **DE-337** to generate the OpenAPI spec from `app.openapi()` so it can't drift again.
  - **Container rebuild still required before runtime/e2e** (§8): `docker compose up -d --build api
arq-worker ingest-worker donna-web` so migration **0049** runs on api boot. Not needed for
    `gen:api` / `npm run check` (the spec is read from the committed yaml).

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
