# Donna — Handoff for the next session

**Date:** 2026-06-12 · **`main` @ `5ccf5d5`** (PR #76 merged) · **v0.1.0 tag @ `c18db35`** · **Pin:**
`vendor/lq-ai` @ `c4d4482`.
**Baseline gates:** `npm run check` 0/0 · vitest **1318** · `npm run lint` **fully green** (prettier +
eslint 0 — keep it green). **Merge PRs with MERGE COMMITS** (a squash orphans the two format SHAs in
`.git-blame-ignore-revs`).

## Where things stand — v0.1.0 is SHIPPED and PUBLIC 🎉

- **Every planned milestone is complete and merged.** P0–P8, Tabular, BYOK, About, docs-polish, the
  full Automations segment, and document-grade run artifacts (lq-ai #138) are all on `main`.
- **v0.1.0 tagged + public.** Annotated tag `v0.1.0` at `c18db35`, Copyright (c) 2026 Kevin Keller,
  Apache-2.0. The repo is **public** (it has stars). **Mirrored** to the user's own remote
  `Tucuxi-Inc/Donna` (git remote `tucuxi`; keep `main` + tags in sync). Note: tag predates PR #76, so
  the pre-built-images feature is on `main` but NOT inside the `v0.1.0` tarball (fine; it's labeled).
- **Pre-built container images (PR #76) is MERGED** — `docker/*.Dockerfile` wrappers,
  `docker-compose.release.yml`, and `.github/workflows/release.yml` are on `main` (Route B: Donna
  self-publishes multi-arch images to `ghcr.io/legalquants/*` for no-clone install). Local
  end-to-end PASSED, Opus-reviewed.
- **Docs buttoned up:** `README.md`, `docs/PRODUCT.md`, `CLAUDE.md` (engineering guide — read first),
  `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/README.md`, `docs/GUIDE.md` (friendly), and
  `docs/About-Donna-v0.1.0.pdf`. Richest docs = in-app `/about`.
- **Dev stack running locally** (project `donna`, app :13002, api :18000). Provider keys were
  **rotated** this session and the `gateway` recreated to load them.

## THE ONE OPEN THREAD — publish the pre-built images

PR #76 added the machinery, but the **actual multi-arch GHCR publish only runs in GitHub Actions** —
it could not be done from a local session. To make the no-clone install path live:

1. **Run the publish workflow:** GitHub → Actions → **"Release container images" → Run workflow** with
   `ref: v0.1.0` and `tag: v0.1.0` (or push a fresh `v*` tag). It builds + pushes `donna-web`,
   `donna-api`, `donna-gateway` (+ `donna-api-base`/`donna-gateway-base`) multi-arch to GHCR.
2. **Make the GHCR packages public:** Actions publishes packages **private** by default — flip each
   package's visibility to public once (org → Packages → each `donna-*` → settings) so an
   unauthenticated `docker pull` works for self-hosters. (All 5 packages, incl. the two `*-base`.)
3. **Verify end-to-end (ideal):** on a clean machine — or an isolated project + shifted ports like the
   fresh-clone/release tests this session — `curl` `docker-compose.release.yml` + `.env.example`, fill
   secrets, `docker compose -f docker-compose.release.yml up -d`, confirm login. Proves the *published*
   images the way a real user hits them. (Local validation this session used locally-built copies of
   the same images — all 8 healthy, skills baked into the worker, login 5/5.)

That's the only unfinished thread. After it, the README's Quick-install flow works for anyone.

## Future / Route 1 (when the user wants it)

- **Route 1 — LQ-AI owns the backend images.** Ready-to-relay ask:
  `docs/upstream-requests/lq-ai-publish-container-images.md`. When LQ-AI publishes `api`/`gateway`
  images to GHCR, Donna drops `docker/*.Dockerfile` + the base/wrapper builds from `release.yml` and
  repoints `docker-compose.release.yml` at the upstream images — removing Donna's only backend-image
  maintenance. **`docker-compose.release.yml` is a hand-maintained mirror of the dev compose — re-sync
  it on any pin bump** until Route 1.
- **Other open ends (all in `docs/roadmap/donna-future-roadmap.md`):** feature screenshots for
  README/About (hero-only today); PR #72 cosmetic nits (precedents list cap, pattern_kind chip color,
  proposal-created copy placement); the unfiled schedule/watch source-switch dual-key upstream ask;
  richer artifact rendering (upstream DE-332, v1 is markdown/text); matters depth (folder tree / file
  versions / sharing — needs a backend contract).
- **New LQ-AI capabilities** as they ship: brainstorm fresh, confirm the contract via `gen:api`,
  mirror the closest analog (Playbooks / Automations). Pin-bump recipe + log: `docs/decisions/lq-ai-pin.md`.

## Workflow reminders (see [[donna-workflow]], [[donna-dev-stack]])

- **The repo is PUBLIC** — be deliberate with anything outward-facing; avoid force-pushing tags
  post-publish (we left `v0.1.0` in place rather than re-moving it for late docs).
- **Always `git fetch` before committing to `main`** — the user merges PRs directly, so local `main`
  goes stale fast (this bit us once at the end of the v0.1.0 session: a handoff commit landed on a
  pre-#76-merge base and had to be reset onto `origin/main`).
- **Loop:** brainstorm → spec → plan → subagent-driven execution (fresh implementer per task + two
  stage review) → whole-branch Opus review → PR with a merge commit. Commit + push per task.
- **Cold start:** `set -a; . ./.env; set +a; docker compose -p donna up -d --build postgres redis
  minio gateway api donna-web ingest-worker arq-worker`. Admin `admin@lq.ai` /
  `$DONNA_E2E_PASSWORD` (currently `DonnaE2ePassw0rd!`). **Rebuild `donna-web` before any manual/e2e
  check.**
- **Upstream-fix workflow:** never edit `vendor/lq-ai`; asks go to `docs/upstream-requests/`, the user
  relays, pin-bump on the merged SHA.
- **Mirror:** push copies to the user's remote with `git push tucuxi main` (+ tags). Keep both in sync
  for anything on `main`.
