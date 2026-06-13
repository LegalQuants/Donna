# CLAUDE.md — engineering guide for Donna

This file orients a coding co-pilot — a human developer or another AI agent (Claude Code reads it
automatically on session start) — so you can understand the whole project and **pick up the roadmap
from where it stands**. Read it once, top to bottom, before your first change.

For _what the product is and why_, read [docs/PRODUCT.md](docs/PRODUCT.md) first. For _how to run
it_, [README.md](README.md). This file is _how to build in it well_.

---

## 1. What Donna is, in one breath

Donna is a standalone **SvelteKit** app — a friendly, document-forward **frontend** for the
[LQ.AI](https://github.com/LegalQuants/lq-ai) legal-AI backend. Donna implements **no** legal-AI
logic itself: retrieval, the citation engine, anonymization, skills, playbooks, tabular review, and
the autonomous runtime all live in lq-ai. Donna's job is to make that power **usable, transparent,
and controllable** through a clean reading-first UI.

Donna talks to lq-ai **only through its published API**, and **vendors** that backend as a pinned
git submodule (`vendor/lq-ai`) so the whole product runs from one compose file.

## 2. The cardinal rules (violate these and you'll break the project's model)

1. **Never edit `vendor/lq-ai`.** It is a pinned submodule, not our code. If you need backend
   behavior that doesn't exist, that's an **upstream request** (§8), not a local patch.
2. **Consume the contract; never hand-fork it.** API types are generated from lq-ai's OpenAPI into
   `src/lib/api/backend.d.ts` via `npm run gen:api`. Derive types from there. (Where the backend
   types a field loosely — `additionalProperties` — hand-type it in a small parser and say so in a
   comment; see the `parseTabularResults` / `parseFindingList` precedents.)
3. **The bar is green, not "no worse."** `npm run check` = 0 errors / 0 warnings; `npm run lint` =
   prettier + eslint fully clean; the unit suite passes. Keep it that way.
4. **Merge PRs with a MERGE COMMIT.** A squash would orphan the two one-time-format SHAs in
   `.git-blame-ignore-revs`. Never squash to `main`.
5. **Evidence before claims.** "It works" requires a run you can point to — a passing test, a live
   e2e, an actual page load. Report failures faithfully.

## 3. Architecture — the backend-for-frontend (BFF)

The browser talks **only** to Donna's SvelteKit server. That server:

- Holds the lq-ai JWT **access + refresh tokens in httpOnly cookies** (never exposed to client JS).
- Attaches `Authorization: Bearer` when proxying to the lq-ai `api`, and **transparently refreshes
  on `401`**. No CORS anywhere.
- Is the single trust boundary: auth lives in `src/hooks.server.ts` + `src/lib/server/`.

Consequences you must internalize:

- **Server-only code** (cookies, the authed `lqClient`, auth wrappers) lives under
  `src/lib/server/`. Never import it into client code.
- A page gets backend data through a **SvelteKit `load`** (SSR) and mutates through **form actions**
  or small **BFF proxy routes** (`+server.ts`) — not by calling lq-ai from the browser.
- Proxy routes exist to (a) attach auth and (b) avoid page/endpoint route collisions — e.g.
  `/prompts/items` sits beside the `/prompts` page, and the `/tabular-executions/[id]` proxy is a
  separate top-level group precisely so it doesn't collide with the `/tabular/[executionId]` page.

## 4. Repo layout

```
src/                         SvelteKit app
  routes/(app)/              authed app routes (the product)
  routes/(auth)/             login / change-password (guarded by hooks.server.ts)
  lib/                       feature modules — one dir per domain
    server/                  SERVER-ONLY: session cookies, authed lqClient, auth wrappers
    api/                     generated OpenAPI types (npm run gen:api) — do not hand-edit
    docpanel/                document panel: PDF render, highlight, TextViewer (md/plain)
    automations/             autonomous runs: sessions, receipts, results, schedules, watches
    tabular/ playbooks/ skills/ prompts/ matters/ knowledge/ inference/ …
  hooks.server.ts            auth routing / token refresh (the global guard)
vendor/lq-ai/                pinned lq-ai backend (submodule) — NEVER edit
docs/                        see docs/README.md for the full index
tests/                       Playwright e2e (live, against the running stack)
static/learn/                interactive playgrounds served by the /about guide
```

## 5. Dev stack — run & verify

Prereqs: Docker + Compose v2, Node 22+. Full setup in the README; the essentials:

```bash
# cold start (loads .env, builds, brings up the explicit service list)
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```

- App at **http://localhost:13002**, lq-ai api at **http://localhost:18000** (ports are _shifted_
  in `.env` so Donna can coexist with a separate raw lq-ai dev stack on the defaults).
- `api` is the **single schema migrator** (workers run with `LQ_AI_SKIP_MIGRATIONS=1`). After a pin
  bump, rebuild `api` + `arq-worker` + `ingest-worker` together so siblings don't crash-loop on a
  revision mismatch.
- `ingest-worker` powers ingestion/RAG + data export; `arq-worker` powers tabular runs, playbook
  generation, and automations. The `arq-worker` mounts `./skills:/skills:ro` and **exits at startup
  if the skills dir is missing** — which is why the clone must be `--recurse-submodules` (the skills
  corpus is a nested submodule).
- **First-run admin fixture** for login/e2e:
  `docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password '<pw>' --no-force-change`

Gates (run before claiming done):

```bash
npm run check        # svelte-check — must be 0 errors / 0 warnings
npm run lint         # prettier + eslint — must be fully green
npx vitest run       # unit/component — keep the suite passing
npx playwright test  # live e2e — needs the stack up + the admin fixture
```

> `npm run check` prints a harmless `ERR_MODULE_NOT_FOUND` referencing `vendor/lq-ai/...`;
> svelte-check recovers and still reports `0 ERRORS`. The vendored backend is excluded from
> check/lint. **Rebuild `donna-web` (`docker compose up -d --build donna-web`) before any manual or
> e2e check** — the running container serves built code, not your working tree.

### Distribution (pre-built images)

Releases publish three multi-arch images to `ghcr.io/legalquants/*` via
`.github/workflows/release.yml` (on a `v*` tag or manual dispatch): `donna-web` (from `Dockerfile`)
and two **wrappers** — `donna-api` (lq-ai api + baked `vendor/lq-ai/skills`) and `donna-gateway`
(lq-ai gateway + baked `gateway.yaml.example`), built via `docker/*.Dockerfile` so the submodule stays
untouched. `docker-compose.release.yml` is the image-only install stack — a **hand-maintained mirror**
of the dev compose's service wiring; **re-sync it on a pin bump**. When LQ-AI publishes its own
images, switch to Route 1 (see `docs/upstream-requests/lq-ai-publish-container-images.md`) and this
maintenance goes away. The build also publishes two `*-base` packages (`donna-api-base`,
`donna-gateway-base`) — the raw lq-ai images the wrappers build `FROM`; they're public so the
multi-arch wrapper build can pull them.

**Desktop launcher (`desktop/`).** A macOS Electron app that orchestrates
`docker-compose.release.yml` for non-technical users — generates secrets, writes a chmod-600 `.env`
in app data, runs the stack + admin fixture, and opens `localhost:13002` in a native window. It
**wraps** the release compose and the published images; it never forks `donna-web` or the backend
(§1/§8 still hold). A pure, unit-tested core (`desktop/src/core/`) holds all logic; a thin Electron
layer wires it. Built/signed/notarized by `.github/workflows/desktop-release.yml`. Phase 1 =
detect-Docker; bundled engine is a later phase. Decision: `docs/decisions/desktop-launcher.md`.

## 6. The build workflow (how every feature here was shipped)

Donna is built with the **superpowers** skill loop. For any non-trivial change, follow it:

1. **Brainstorm** (`superpowers:brainstorming`) → a design doc in `docs/superpowers/specs/`.
2. **Plan** (`superpowers:writing-plans`) → a task-by-task plan in `docs/superpowers/plans/`.
3. **Execute** (`superpowers:subagent-driven-development`) — a fresh implementer subagent per task,
   each doing **TDD** (failing test → implement → green → commit), followed by **two-stage review**
   (spec compliance, then code quality) per task.
4. **Whole-branch review** (Opus) before the PR.
5. **PR** with a merge commit. **Commit + push per task** as you go.

Scale the ceremony to the change: a one-line fix doesn't need a spec, but anything that adds a
surface or touches a contract does. The specs/plans for every shipped phase are archived under
`docs/superpowers/` — **read the closest analog before building** (e.g. mirror how Playbooks did
list→detail→execute→poll→typed results, or how Automations threaded `memories_total` through the
receipt chain).

## 7. Conventions & patterns (match these)

- **Svelte 5 runes** throughout (`$props`, `$state`, `$derived`, `$effect`). Seed reactive
  controllers from `data` once via `untrack(() => …)` to avoid `state_referenced_locally` warnings.
- **Tabs** for indentation (prettier-enforced) — copy a neighboring file's style.
- **Defensive parsers** at the data boundary: a `parseXList(raw: unknown)` with local `str`/`obj`
  guards that drops malformed rows rather than throwing. (`findings.ts`, `artifacts.ts`,
  `schedules.ts` are the templates.)
- **Honest degradation:** a server loader degrades each sub-fetch to `null` independently — a failed
  Results fetch hides a section or shows "unavailable"; it never breaks the page or fabricates data.
  Live pollers keep **last-known-good** (only overwrite state on non-null incoming).
- **Form-action server tests:** mock `lqFetch`, build a `Request` with a `URLSearchParams` body,
  assert the redirect/`fail`. (See any `+page.server.test.ts` under `routes/(app)/`.)
- **Live e2e** are real Playwright runs against the stack, **self-cleaning** (try/finally teardown).
  When a feature's output is model-discretionary (artifacts, findings), **SQL-seed** marker rows via
  `docker compose exec -T postgres psql` (creds `lq_ai`/`lq_ai`); helpers live in
  `tests/automations-memory-review.spec.ts` / `tests/automations-artifacts.spec.ts`. Postgres note:
  `files` keys on `owner_id`; autonomous tables key on the parent `session_id`.
- **Doc panel:** open a document with `docPanel.open({ source_file_id, … } as Citation)`; the panel
  routes PDFs to `PdfViewer`, `text/markdown`/`text/plain` to `TextViewer`, everything else to
  `UnsupportedFileCard`.

## 8. The upstream-request workflow (when the API isn't enough)

You will hit gaps where lq-ai doesn't expose what a feature needs. Do **not** work around it by
editing the submodule or coupling to internals. Instead:

1. Write the ask to `docs/upstream-requests/lq-ai-<short-name>.md` — the gap, the proposed
   contract, and why. Use absolute file paths if the lq-ai maintainer works in a different checkout.
2. The human relays it to the lq-ai maintainer session.
3. When the fix merges, **bump the pin**:
   ```bash
   cd vendor/lq-ai && git fetch && git checkout <sha>
   cd ../.. && npm run gen:api                      # regenerate types
   docker compose up -d --build api arq-worker ingest-worker donna-web   # migrations run on api boot
   ```
   Then **verify the merged contract in `src/lib/api/backend.d.ts`** — the merged shape wins over
   the ask — record the bump in `docs/decisions/lq-ai-pin.md`, and build the consuming slice.

`docs/decisions/lq-ai-pin.md` is the running log of every pin bump and what it unblocked — read its
top entry to know what backend you're on (currently `c4d4482`).

## 9. Picking up a roadmap item

1. Read [docs/PRODUCT.md](docs/PRODUCT.md) (the why) and
   [docs/roadmap/donna-future-roadmap.md](docs/roadmap/donna-future-roadmap.md) (what's deferred and
   why, with pickup context).
2. Check whether it's **buildable now** or **upstream-blocked**. If blocked, the roadmap names the
   upstream request; that path is §8.
3. `npm run gen:api` and confirm the contract supports it (types over assumptions).
4. Find the **closest shipped analog** in `docs/superpowers/` and mirror its shape.
5. Run the loop in §6. Keep the gates green. Open a PR with a merge commit.

## 10. Hard-won gotchas (don't relearn these)

- **`.txt` won't ingest** (`unsupported_type`) — use `.pdf` fixtures for ingestion/RAG e2e.
- **`skill_inputs`** only interpolate `{{placeholder}}` tokens in a skill body; the gateway appends
  unreferenced bound inputs as a labelled context block (lq-ai #115) so they still reach the model.
- The SSE **complete frame echoes `applied_*` fields at the top level** (e.g. `applied_skills`,
  `applied_file_ids`, `routed_inference_tier`).
- Chat **citations** come from a per-message endpoint, not the SSE complete frame.
- **Autonomous run artifacts** are markdown/plain-text in v0.1.0; the doc panel renders them inline.
  PDF/DOCX artifact rendering is an open upstream item (DE-332).
- A SvelteKit form-action POST needs an **`Origin` header** (CSRF) — browsers and Playwright send
  it; raw `curl` doesn't, so a hand-forged `curl` login will 403/404. Test login via Playwright.
- Production builds set `Secure` session cookies → any **non-localhost deploy must terminate TLS**
  in front of `donna-web` or login silently fails.

## 11. Where the deep history lives

- `docs/superpowers/specs/` + `plans/` — the design + task breakdown for every shipped phase.
- `docs/superpowers/HANDOFF-*.md` — session handoffs (point-in-time; the pin log + this file are the
  durable references).
- `docs/decisions/lq-ai-pin.md` — every backend pin bump and what it unblocked.
- `docs/upstream-requests/` — the asks filed to lq-ai (some resolved, some open).
- **The app itself** — sign in and open `/about` for the richest, most current explanation of every
  feature, including playgrounds for the LQ-AI engine.
