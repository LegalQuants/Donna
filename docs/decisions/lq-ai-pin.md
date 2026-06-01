# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `badf83d` (bumped 2026-06-01 from `438198c`; tag `v0.4.0-5-gbadf83d`)
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.

### Bump log
- `438198c` → `badf83d` (2026-06-01): consolidated bump landing all **three** Donna
  backend asks (relay `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`), plus the
  whole `v0.3.1`→`v0.4.0` upstream range:
  - **#115 (DE-328, ask P1.1)** — gateway **skill assembler** now appends *unreferenced*
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
  preferences-schema comment (no schema removal). Donna consumes none of the *new* surface
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
