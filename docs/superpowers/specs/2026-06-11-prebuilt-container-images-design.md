# Pre-built container images + one-command install (design)

**Date:** 2026-06-11 · **Branch:** `feat/prebuilt-images` · **Goal:** let someone install and run
Donna without cloning the repo, the submodules, or a build toolchain — download a compose file and an
env file, fill in secrets, `docker compose up`.

## Problem

Today's install (README "Run the full stack") requires: a recursive clone (Donna + the `lq-ai`
submodule + the nested `lq-skills` submodule), `npm install`, `npm run gen:api`, and
`docker compose up -d --build …` — which **builds every image from source**. That's a high bar for the
non-technical audience Donna is meant to reach (solo practitioners, legal-aid staff, students). The
fix is pre-built images published to a public registry plus a self-contained compose file.

This is **Route B** (Donna self-publishes everything) — chosen as a **one-off** for v0.1.0. The
backend images are really LQ-AI's to own long-term; when LQ-AI publishes its own images, a future
Donna can switch to **Route 1** (consume upstream images, drop Donna's wrapper images + their CI).
This spec ships Route B *and* leaves the Route 1 path documented and ready to hand off (see §6).

## Constraints (carried from the project's rules)

- **Never edit `vendor/lq-ai`.** The skills corpus and default gateway config are baked into images
  via thin Donna-side **wrapper Dockerfiles**, not by modifying the submodule.
- **Multi-arch.** Publish `linux/amd64` + `linux/arm64` so Apple-Silicon users don't emulate.
- **Same `.env` contract.** The release compose reads the existing `.env` variables; secrets are
  still required (this removes the *build*, not the *config*).
- **Registry namespace:** `ghcr.io/legalquants/*` (the canonical public repo), per user decision.

## Approach

### Image set (3 Donna-published images)

All multi-arch, tagged `vX.Y.Z` + `latest`.

1. **`ghcr.io/legalquants/donna-web`** — built directly from the existing root `Dockerfile`
   (SvelteKit adapter-node; self-contained because the generated API types are committed). No
   wrapper needed.
2. **`ghcr.io/legalquants/donna-api`** — a wrapper image: `FROM` the lq-ai `api` image (built from
   `vendor/lq-ai/api`), then `COPY vendor/lq-ai/skills → /skills` and set
   `LQ_AI_SKILLS_DIR=/skills`. This is the image for **all three** backend services — `api`
   (its Dockerfile's default CMD), `ingest-worker` (command
   `["arq","app.workers.document_pipeline.WorkerSettings"]`), and `arq-worker` (command
   `["arq","app.workers.arq_setup.WorkerSettings"]`). Baking the skills is what makes the
   `arq-worker`/`api` skills mount unnecessary (the worker exits at startup without a skills dir).
3. **`ghcr.io/legalquants/donna-gateway`** — a wrapper image: `FROM` the lq-ai `gateway` image
   (built from `vendor/lq-ai/gateway`), then `COPY vendor/lq-ai/gateway.yaml.example →
   /usr/share/lq-ai/gateway.yaml.example` (the path the gateway entrypoint seeds its runtime
   `gateway.yaml` from). This removes the need to mount a config file.

The upstream images that already need no build are used as-is in the release compose:
`pgvector/pgvector:pg16`, `redis:7-alpine`, `minio/minio:latest`.

### Wrapper Dockerfiles

Two new files under `docker/`:

- `docker/api.Dockerfile` — `ARG BASE` → `FROM ${BASE}` → `COPY skills/ /skills` →
  `ENV LQ_AI_SKILLS_DIR=/skills`. (Build context is `vendor/lq-ai/` so `skills/` resolves.)
- `docker/gateway.Dockerfile` — `ARG BASE` → `FROM ${BASE}` →
  `COPY gateway.yaml.example /usr/share/lq-ai/gateway.yaml.example`. (Build context `vendor/lq-ai/`.)

The lq-ai base images are built first (from `vendor/lq-ai/api` and `vendor/lq-ai/gateway`), pushed to
GHCR as the versioned base layers, and the wrappers build `FROM` those pushed bases — the
multi-arch-safe ordering (the wrapper's `FROM` resolves a real multi-arch manifest in the registry,
which a local single-arch tag can't provide). The base images are published as
`ghcr.io/legalquants/donna-api-base` / `donna-gateway-base` (less prominent, but public for the
wrapper `FROM` to pull during the build).

### `docker-compose.release.yml`

A standalone, **image-only** compose at the repo root — *not* using `include:` (which would pull in
build contexts and the relative `./skills` / `gateway.yaml` mounts). It mirrors the merged stack's
service wiring (env, healthchecks, depends_on, ports) but with:

- `image:` refs to the published images instead of `build:`,
- no `./skills:/skills:ro` mounts (baked in),
- no `gateway.yaml.example` mount (baked in); the gateway keeps its writable runtime-config volume,
- the same `.env`-driven host ports, secrets, and `LQ_AI_SKIP_MIGRATIONS=1` on the workers (the
  `api` remains the single migrator).

Eight services: `postgres`, `redis`, `minio`, `gateway`, `api`, `ingest-worker`, `arq-worker`,
`donna-web`. This file is a **hand-maintained mirror** of the vendored compose and must be re-synced
on a pin bump — a cost Route 1 later removes (called out in §6 + CLAUDE.md).

### `.github/workflows/release.yml`

- **Triggers:** push of a `v*` tag, **and** `workflow_dispatch` with a `ref`/tag input (so the
  already-pushed `v0.1.0` images can be published on demand).
- **Permissions:** `contents: read`, `packages: write`.
- **Steps:** `actions/checkout` with `submodules: recursive` → `docker/setup-qemu-action` →
  `docker/setup-buildx-action` → `docker/login-action` (registry `ghcr.io`, `GITHUB_TOKEN`) →
  build+push (`docker/build-push-action`, `platforms: linux/amd64,linux/arm64`) the base images, then
  the wrapper images, then `donna-web` — each tagged with the release version + `latest`.

### README — "Quick install (pre-built)"

A new section *above* the build-from-source instructions:

1. Download `docker-compose.release.yml` and `.env.example` (raw GitHub links).
2. `cp .env.example .env` and fill the required secrets.
3. `docker compose -f docker-compose.release.yml up -d`.
4. Run the first-run admin fixture (unchanged command), open `http://localhost:13002`.

Honest caveats retained: still needs Docker + a filled `.env`; cloud inference needs provider keys
**or** run fully local on Ollama (the prebuilt + local-model path is the lowest-barrier option,
ideal for non-technical / access-to-justice users); the `Secure`-cookie TLS note for non-localhost.

## Documentation / the Route 1 hand-off (§6)

- **`docs/upstream-requests/lq-ai-publish-container-images.md`** — the ready-to-relay ask: have LQ-AI
  publish `api` + `gateway` images to GHCR (skills corpus + a sensible default `gateway.yaml`
  baked in, multi-arch, tagged per release **and** per commit SHA so a consumer can pin), with
  acceptance criteria and the exact way Donna would consume them. When implemented, Donna deletes
  `docker/*.Dockerfile`, drops the base/wrapper builds from `release.yml` (keeping only `donna-web`),
  and repoints `docker-compose.release.yml` at the upstream images.
- **`docs/roadmap/donna-future-roadmap.md`** — add a "Container images" entry: Route B shipped as a
  one-off for v0.1.0; Route 1 is the future once LQ-AI publishes images (pointer to the upstream doc).
- **`CLAUDE.md`** — a short note in the dev-stack/distribution area: how the release images are built
  (wrapper-on-upstream), that the release compose is a hand-maintained mirror to re-sync on pin
  bumps, and the Route 1 exit.
- **Memory + a handoff note** capturing the decision and the path.

## Verification

- **Local (full):** build the three images locally (single-arch for speed; the wrapper Dockerfiles
  and the skills/config baking are arch-independent), stand the stack up via
  `docker-compose.release.yml` pointing at the locally-built tags, and confirm all 8 services healthy
  + a real-browser login (the fresh-clone test's rigor) — proving the compose, the baked skills, and
  the baked gateway config work end-to-end with **no clone-time mounts**.
- **Workflow (static):** `release.yml` written to standard and lint-checked (`actionlint` if
  available; otherwise a careful self-review). The actual **multi-arch GHCR publish runs only in
  GitHub Actions** on a tag/dispatch — not verifiable from here; the first real publish is when the
  user pushes a tag or dispatches the workflow (e.g. to mint `v0.1.0` images).

## Out of scope

- Publishing the LQ-AI images under LQ-AI's own namespace (that's Route 1 / the upstream ask).
- A bespoke `install.sh` (the two-file + `docker compose` flow is simple enough; can be a later add).
- Pushing images from this session (no CI run here); the workflow + local validation are the
  deliverables.
- Helm charts / k8s manifests / non-compose orchestration.
- Changing the build-from-source path — it stays as the developer path.

## File structure (new/changed)

- Create: `docker/api.Dockerfile`, `docker/gateway.Dockerfile`
- Create: `docker-compose.release.yml`
- Create: `.github/workflows/release.yml`
- Create: `docs/upstream-requests/lq-ai-publish-container-images.md`
- Modify: `README.md` (Quick install section), `docs/roadmap/donna-future-roadmap.md`, `CLAUDE.md`
- Memory + handoff updated post-merge.
