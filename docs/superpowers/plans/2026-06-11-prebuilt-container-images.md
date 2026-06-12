# Pre-built Container Images + One-Command Install — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone install and run Donna without cloning the repo or building from source — download `docker-compose.release.yml` + `.env.example`, fill secrets, `docker compose up`. Pre-built multi-arch images on `ghcr.io/legalquants/*`.

**Architecture:** Three Donna-published images (`donna-web`, `donna-api`, `donna-gateway`). `donna-api`/`donna-gateway` are thin **wrapper images** that layer the skills corpus / default gateway config on top of the lq-ai-built base images — so `vendor/lq-ai` is never edited. A GitHub Actions workflow builds + pushes them on a release tag. A flattened, image-only `docker-compose.release.yml` references them.

**Tech Stack:** Docker + buildx (multi-arch), GitHub Actions (GHCR via `GITHUB_TOKEN`), the existing lq-ai compose as the wiring reference.

**Spec:** `docs/superpowers/specs/2026-06-11-prebuilt-container-images-design.md` — read it first.

**Branch:** `feat/prebuilt-images` (spec already committed).

**Nature of this work:** infrastructure + docs, not unit-testable code. "Tests" here = **docker builds succeed**, **the stack stands up healthy**, and **login works** — proven by a local end-to-end validation (Task 3), the same rigor as the fresh-clone test done earlier this session. The CI publish itself runs only in GitHub Actions on a tag; it ships written-to-standard + lint-checked, with the build logic proven locally.

**House rules:** never edit `vendor/lq-ai`; keep `npm run lint` green (the new `.md`/`.yml` files are prettier-checked — run `npx prettier --write` on them); commit + push per task; commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

- Create: `docker/api.Dockerfile` — wrapper: lq-ai api image + baked skills.
- Create: `docker/gateway.Dockerfile` — wrapper: lq-ai gateway image + baked default config.
- Create: `docker-compose.release.yml` — flattened, image-only stack (8 services).
- Create: `.github/workflows/release.yml` — build + push the 3 images (+ 2 bases) on tag/dispatch.
- Create: `docs/upstream-requests/lq-ai-publish-container-images.md` — the Route 1 hand-off ask.
- Modify: `.env.example` — add `DONNA_IMAGE_TAG`.
- Modify: `README.md` — "Quick install (pre-built)" section.
- Modify: `docs/roadmap/donna-future-roadmap.md` — Container images entry (Route B now, Route 1 later).
- Modify: `CLAUDE.md` — short distribution note.

---

### Task 1: Wrapper Dockerfiles (bake skills + gateway config)

**Files:**

- Create: `docker/api.Dockerfile`
- Create: `docker/gateway.Dockerfile`

- [ ] **Step 1: Confirm the base images lack the files we're about to bake**

The lq-ai compose *mounts* `./skills` into api/arq-worker and `gateway.yaml.example` into gateway — strong evidence the images don't already contain them. Confirm against the already-built dev images (the running `donna` stack built them from the pinned submodule), so we reuse them as bases instead of a slow rebuild:

```bash
# Discover the dev-stack image names (compose names them <project>-<service>)
docker compose -p donna images api gateway | awk 'NR==1 || /api|gateway/'
```

Note the `api` and `gateway` image references (e.g. `donna-api`, `donna-gateway` — the compose-built tags). Then verify the files are absent in the base:

```bash
API_BASE=$(docker compose -p donna images api --format '{{.Repository}}:{{.Tag}}' | head -1)
GW_BASE=$(docker compose -p donna images gateway --format '{{.Repository}}:{{.Tag}}' | head -1)
echo "api base=$API_BASE  gateway base=$GW_BASE"
docker run --rm "$API_BASE" sh -c 'ls /skills 2>/dev/null && echo "SKILLS ALREADY BAKED" || echo "no /skills (wrapper needed)"'
docker run --rm "$GW_BASE" sh -c 'ls /usr/share/lq-ai/gateway.yaml.example 2>/dev/null && echo "CONFIG ALREADY BAKED" || echo "no example (wrapper needed)"'
```

Expected: both report "wrapper needed". (If either reports "ALREADY BAKED", that wrapper is unnecessary — note it, and in Tasks 2-4 use the base image directly for that service. Proceed assuming both are needed, the expected case.)

- [ ] **Step 2: Create `docker/api.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Donna-published wrapper over the lq-ai `api` image. Bakes the skills corpus
# (vendor/lq-ai/skills, the nested lq-skills submodule) into the image so the
# api / ingest-worker / arq-worker need no `./skills` bind mount — without
# editing vendor/lq-ai. Build context MUST be vendor/lq-ai/ so `skills/`
# resolves. BASE is the lq-ai api image (built first; see release.yml).
ARG BASE
FROM ${BASE}
COPY skills /skills
ENV LQ_AI_SKILLS_DIR=/skills
```

- [ ] **Step 3: Create `docker/gateway.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Donna-published wrapper over the lq-ai `gateway` image. Bakes the default
# gateway.yaml.example into the path the gateway entrypoint seeds its runtime
# /etc/lq-ai/gateway.yaml from on first boot — so no config mount is needed.
# Build context MUST be vendor/lq-ai/ so `gateway.yaml.example` resolves.
# BASE is the lq-ai gateway image (built first; see release.yml).
ARG BASE
FROM ${BASE}
COPY gateway.yaml.example /usr/share/lq-ai/gateway.yaml.example
```

- [ ] **Step 4: Build both wrappers locally over the dev-stack bases and verify the files landed**

```bash
docker build -f docker/api.Dockerfile --build-arg BASE="$API_BASE" -t donna-api:localtest vendor/lq-ai
docker build -f docker/gateway.Dockerfile --build-arg BASE="$GW_BASE" -t donna-gateway:localtest vendor/lq-ai
docker run --rm donna-api:localtest sh -c 'ls /skills | head -3; echo "skills count: $(ls /skills | wc -l)"; echo "LQ_AI_SKILLS_DIR=$LQ_AI_SKILLS_DIR"'
docker run --rm donna-gateway:localtest sh -c 'ls -la /usr/share/lq-ai/gateway.yaml.example'
```

Expected: `donna-api:localtest` lists ~17 skills entries and shows `LQ_AI_SKILLS_DIR=/skills`; `donna-gateway:localtest` shows the ~23 KB `gateway.yaml.example`. Keep these `:localtest` images — Task 3 reuses them.

- [ ] **Step 5: Commit**

```bash
git add docker/api.Dockerfile docker/gateway.Dockerfile
git commit -m "feat(images): wrapper Dockerfiles baking skills + gateway config over lq-ai bases"
git push
```

---

### Task 2: `docker-compose.release.yml` (image-only stack)

**Files:**

- Create: `docker-compose.release.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add `DONNA_IMAGE_TAG` to `.env.example`**

Append after the host-ports block (near the top), so the release flow can pin images:

```bash
# --- Pre-built image tag (docker-compose.release.yml only; ignored by the
#     build-from-source compose). Default 'latest'; pin to a release, e.g. v0.1.0. ---
DONNA_IMAGE_TAG=latest
```

- [ ] **Step 2: Create `docker-compose.release.yml`**

A standalone, image-only mirror of the dev stack's eight Donna services. No `include:`, no `build:`, no `./skills` / `gateway.yaml` mounts (baked into the images). Env/healthcheck/depends_on/ports/volumes mirror `vendor/lq-ai/docker-compose.yml` + Donna's `donna-web` exactly. Full contents:

```yaml
# Donna — pre-built image stack (no clone, no build).
#
# Quick install:
#   curl -O https://raw.githubusercontent.com/LegalQuants/Donna/main/docker-compose.release.yml
#   curl -o .env https://raw.githubusercontent.com/LegalQuants/Donna/main/.env.example
#   # edit .env: set the required secrets (and optionally DONNA_IMAGE_TAG=v0.1.0)
#   docker compose -f docker-compose.release.yml up -d
#
# Images are published from github.com/LegalQuants/Donna to ghcr.io/legalquants.
# This file is a hand-maintained mirror of vendor/lq-ai/docker-compose.yml +
# the donna-web service; re-sync it when the lq-ai pin bumps. (See CLAUDE.md.)
name: donna

services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-lq_ai}
      POSTGRES_USER: ${POSTGRES_USER:-lq_ai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "${POSTGRES_BIND_ADDR:-127.0.0.1}:${POSTGRES_HOST_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-lq_ai} -d $${POSTGRES_DB:-lq_ai}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    ports:
      - "${REDIS_BIND_ADDR:-127.0.0.1}:${REDIS_HOST_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-lq_ai}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}
    volumes:
      - miniodata:/data
    ports:
      - "${MINIO_BIND_ADDR:-127.0.0.1}:${MINIO_API_HOST_PORT:-9000}:9000"
      - "${MINIO_BIND_ADDR:-127.0.0.1}:${MINIO_CONSOLE_HOST_PORT:-9001}:9001"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9000/minio/health/live || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 6

  gateway:
    image: ghcr.io/legalquants/donna-gateway:${DONNA_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      LQ_AI_GATEWAY_KEY: ${LQ_AI_GATEWAY_KEY:?LQ_AI_GATEWAY_KEY is required}
      LQ_AI_API_URL: ${LQ_AI_API_URL:-http://api:8000}
      LQ_AI_SKILL_CACHE_TTL_SECONDS: ${LQ_AI_SKILL_CACHE_TTL_SECONDS:-60}
      DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://${POSTGRES_USER:-lq_ai}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lq_ai}}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-}
      AWS_REGION: ${AWS_REGION:-us-east-1}
      AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY:-}
      AZURE_OPENAI_RESOURCE: ${AZURE_OPENAI_RESOURCE:-}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://ollama:11434}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}
      LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY:-}
      LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY:-}
      LANGFUSE_HOST: ${LANGFUSE_HOST:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      LQ_AI_DEV_MODE: ${LQ_AI_DEV_MODE:-false}
    volumes:
      - gateway-config:/etc/lq-ai
    ports:
      - "${GATEWAY_BIND_ADDR:-127.0.0.1}:${GATEWAY_HOST_PORT:-8001}:8001"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health', timeout=2).status == 200 else 1)"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    image: ghcr.io/legalquants/donna-api:${DONNA_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      gateway:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://${POSTGRES_USER:-lq_ai}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lq_ai}}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}
      S3_ENDPOINT_URL: ${S3_ENDPOINT_URL:-http://minio:9000}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-${MINIO_ROOT_USER:-lq_ai}}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD}}
      S3_BUCKET: ${S3_BUCKET:-lq-ai-files}
      S3_REGION: ${S3_REGION:-us-east-1}
      LQ_AI_GATEWAY_URL: ${LQ_AI_GATEWAY_URL:-http://gateway:8001}
      LQ_AI_GATEWAY_KEY: ${LQ_AI_GATEWAY_KEY:?LQ_AI_GATEWAY_KEY is required}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      JWT_ACCESS_TOKEN_TTL_SECONDS: ${JWT_ACCESS_TOKEN_TTL_SECONDS:-900}
      JWT_REFRESH_TOKEN_TTL_SECONDS: ${JWT_REFRESH_TOKEN_TTL_SECONDS:-604800}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      LQ_AI_DEV_MODE: ${LQ_AI_DEV_MODE:-false}
      LQ_AI_CORS_ORIGINS: ${LQ_AI_CORS_ORIGINS:-}
      LQ_AI_SKILLS_DIR: ${LQ_AI_SKILLS_DIR:-/skills}
      LQ_AI_BRIDGE_TOKEN: ${LQ_AI_BRIDGE_TOKEN:-}
      LQ_AI_BRIDGE_MASTER_KEY: ${LQ_AI_BRIDGE_MASTER_KEY:-}
    ports:
      - "${API_BIND_ADDR:-127.0.0.1}:${API_HOST_PORT:-8000}:8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=2).status == 200 else 1)"]
      interval: 5s
      timeout: 3s
      retries: 10

  ingest-worker:
    image: ghcr.io/legalquants/donna-api:${DONNA_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      api:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://${POSTGRES_USER:-lq_ai}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lq_ai}}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}
      LQ_AI_SKIP_MIGRATIONS: "1"
      S3_ENDPOINT_URL: ${S3_ENDPOINT_URL:-http://minio:9000}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-${MINIO_ROOT_USER:-lq_ai}}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD}}
      S3_BUCKET: ${S3_BUCKET:-lq-ai-files}
      S3_REGION: ${S3_REGION:-us-east-1}
      LQ_AI_INGEST_WORKER_CONCURRENCY: ${LQ_AI_INGEST_WORKER_CONCURRENCY:-2}
      LQ_AI_DOCLING_TIMEOUT_SECONDS: ${LQ_AI_DOCLING_TIMEOUT_SECONDS:-300}
      LQ_AI_DOCLING_ENABLED: ${LQ_AI_DOCLING_ENABLED:-true}
      LQ_AI_CHUNK_TARGET_CHARS: ${LQ_AI_CHUNK_TARGET_CHARS:-2000}
      LQ_AI_CHUNK_OVERLAP_CHARS: ${LQ_AI_CHUNK_OVERLAP_CHARS:-200}
      LQ_AI_GATEWAY_URL: ${LQ_AI_GATEWAY_URL:-http://gateway:8001}
      LQ_AI_GATEWAY_KEY: ${LQ_AI_GATEWAY_KEY:?LQ_AI_GATEWAY_KEY is required}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - ingest-hf-cache:/root/.cache/huggingface
      - ingest-easyocr-cache:/root/.EasyOCR
    command: ["arq", "app.workers.document_pipeline.WorkerSettings"]
    healthcheck:
      test: ["CMD", "python", "-c", "import os; from redis import Redis; r = Redis.from_url(os.environ['REDIS_URL']); r.ping()"]
      interval: 10s
      timeout: 5s
      retries: 6

  arq-worker:
    image: ghcr.io/legalquants/donna-api:${DONNA_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      api:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://${POSTGRES_USER:-lq_ai}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lq_ai}}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}
      LQ_AI_SKIP_MIGRATIONS: "1"
      LQ_AI_GATEWAY_URL: ${LQ_AI_GATEWAY_URL:-http://gateway:8001}
      LQ_AI_GATEWAY_KEY: ${LQ_AI_GATEWAY_KEY:?LQ_AI_GATEWAY_KEY is required}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      LQ_AI_SKILLS_DIR: ${LQ_AI_SKILLS_DIR:-/skills}
    command: ["arq", "app.workers.arq_setup.WorkerSettings"]
    healthcheck:
      test: ["CMD", "python", "-c", "import os; from redis import Redis; r = Redis.from_url(os.environ['REDIS_URL']); r.ping()"]
      interval: 10s
      timeout: 5s
      retries: 6

  donna-web:
    image: ghcr.io/legalquants/donna-web:${DONNA_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    environment:
      ORIGIN: ${ORIGIN:-http://localhost:3000}
      LQ_API_INTERNAL_URL: http://api:8000
    ports:
      - "127.0.0.1:${DONNA_WEB_HOST_PORT:-3000}:3000"
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
        ]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

volumes:
  pgdata:
  redisdata:
  miniodata:
  gateway-config:
  ingest-hf-cache:
  ingest-easyocr-cache:
```

- [ ] **Step 3: Validate the compose parses (config lint)**

```bash
DONNA_IMAGE_TAG=latest POSTGRES_PASSWORD=x MINIO_ROOT_PASSWORD=xxxxxxxx LQ_AI_GATEWAY_KEY=x JWT_SECRET=x \
  docker compose -f docker-compose.release.yml config >/dev/null && echo "release compose: valid"
```

Expected: prints "release compose: valid" (no parse/interpolation error). Also run `npx prettier --write docker-compose.release.yml` and confirm `npm run lint` stays green for the new file.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.release.yml .env.example
git commit -m "feat(images): docker-compose.release.yml — image-only stack + DONNA_IMAGE_TAG"
git push
```

---

### Task 3: Local end-to-end validation (the integration test)

**Files:** none (validation only). Proves Tasks 1+2: baked skills satisfy the worker + migrations, baked gateway config seeds, the compose wiring is correct, and login works — with **no clone-time mounts**.

Runs **isolated** (distinct project name + shifted ports) so it never touches the running `donna` dev stack — exactly like the fresh-clone validation done earlier this session.

- [ ] **Step 1: Tag the locally-built wrapper images as the release refs**

The release compose references `ghcr.io/legalquants/donna-api:latest` etc. Point those at the `:localtest` images from Task 1 (and donna-web from the dev stack or a fresh local build), so `up` uses local images with no pull:

```bash
# api + gateway wrappers (built in Task 1)
docker tag donna-api:localtest    ghcr.io/legalquants/donna-api:latest
docker tag donna-gateway:localtest ghcr.io/legalquants/donna-gateway:latest
# donna-web: build locally from the repo Dockerfile
docker build -f Dockerfile -t ghcr.io/legalquants/donna-web:latest .
```

- [ ] **Step 2: Write an isolated env for the test instance**

Create `/tmp/donna-release-test.env` with a third port range (the running dev stack holds 13002/18000/25432…; the verify run earlier used 33xxx — reuse a free range), real secrets, and the cloud keys from the repo `.env` so inference could work:

```bash
cd /Users/kevinkeller/Code/Donna
ANTHRO=$(grep -E '^ANTHROPIC_API_KEY=' .env | cut -d= -f2-)
OPENAI=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)
cat > /tmp/donna-release-test.env <<EOF
DONNA_IMAGE_TAG=latest
POSTGRES_HOST_PORT=45432
REDIS_HOST_PORT=46379
MINIO_API_HOST_PORT=49000
MINIO_CONSOLE_HOST_PORT=49001
GATEWAY_HOST_PORT=48001
API_HOST_PORT=48000
DONNA_WEB_HOST_PORT=43002
ORIGIN=http://localhost:43002
POSTGRES_DB=lq_ai
POSTGRES_USER=lq_ai
POSTGRES_PASSWORD=relpass123
MINIO_ROOT_USER=lq_ai
MINIO_ROOT_PASSWORD=relminio123
S3_ACCESS_KEY=lq_ai
S3_SECRET_KEY=relminio123
LQ_AI_GATEWAY_KEY=relgatewaykey
JWT_SECRET=rel-jwt-secret-long-random
ANTHROPIC_API_KEY=${ANTHRO}
OPENAI_API_KEY=${OPENAI}
OLLAMA_BASE_URL=http://host.docker.internal:11434
EOF
echo "wrote /tmp/donna-release-test.env (web :43002, api :48000)"
```

- [ ] **Step 3: Bring up the release stack, isolated**

```bash
docker compose -p donna_release_test --env-file /tmp/donna-release-test.env \
  -f docker-compose.release.yml up -d 2>&1 | tail -8
```

- [ ] **Step 4: Wait for all 8 services healthy**

```bash
for i in $(seq 1 36); do
  PS=$(docker compose -p donna_release_test ps --format '{{.Service}}={{.Health}}' 2>/dev/null)
  UNHEALTHY=$(echo "$PS" | grep -Ev '=healthy$' | grep -v '^$')
  if [ -z "$UNHEALTHY" ] && [ "$(echo "$PS" | grep -c healthy)" -ge 8 ]; then echo "ALL HEALTHY:"; echo "$PS"; break; fi
  echo "$PS" | grep -qE 'exited|restarting' && { echo "FAILURE:"; echo "$PS"; break; }
  sleep 5
done
```

Expected: all 8 (`postgres, redis, minio, gateway, api, ingest-worker, arq-worker, donna-web`) `=healthy`. The critical proofs: `api` migrated a fresh DB (baked skills let migration 0032 read the seed playbook), and `arq-worker` did **not** exit (baked skills satisfied its startup registry).

- [ ] **Step 5: Prove the baked content is actually in use + login works**

```bash
# baked skills present in the running api/arq-worker (no mount)
docker compose -p donna_release_test exec -T arq-worker sh -c 'ls /skills | wc -l' 
# gateway seeded its runtime config from the baked example
docker compose -p donna_release_test exec -T gateway sh -c 'ls -la /etc/lq-ai/gateway.yaml'
# mint the admin fixture, then a real-browser login
docker compose -p donna_release_test exec -T api python -m app.cli reset-admin-password \
  --email admin@lq.ai --password 'DonnaE2ePassw0rd!' --no-force-change
cd /Users/kevinkeller/Code/Donna && set -a; . /tmp/donna-release-test.env; set +a
DONNA_BASE_URL=http://localhost:43002 DONNA_E2E_EMAIL=admin@lq.ai DONNA_E2E_PASSWORD='DonnaE2ePassw0rd!' \
  npx playwright test tests/about.spec.ts --reporter=line 2>&1 | tail -8
```

Expected: skills count > 0; `/etc/lq-ai/gateway.yaml` exists (seeded from the baked example); Playwright `about.spec.ts` passes (real-browser login + authed nav against the pre-built stack).

- [ ] **Step 6: Tear down the test instance (with volumes) and clean up the local release tags**

```bash
docker compose -p donna_release_test --env-file /tmp/donna-release-test.env -f docker-compose.release.yml down -v
rm -f /tmp/donna-release-test.env
# confirm the running dev stack is untouched
docker compose -p donna ps --format '{{.Service}} {{.Status}}' | sort
```

Expected: test instance + its volumes removed; the `donna` dev stack still all healthy. (Leave the `ghcr.io/legalquants/...:latest` local tags; harmless. No commit — validation only. Record the result in the PR description.)

---

### Task 4: GitHub Actions release workflow

**Files:**

- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release container images

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      ref:
        description: "Git ref (tag/branch/SHA) to build from"
        required: true
        default: "main"
      tag:
        description: "Image tag to publish (e.g. v0.1.0)"
        required: true
        default: "latest"

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  NAMESPACE: legalquants
  PLATFORMS: linux/amd64,linux/arm64

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (with submodules)
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.ref || github.ref }}
          submodules: recursive

      - name: Resolve image tag
        id: meta
        run: |
          if [ "${{ github.event_name }}" = "push" ]; then
            echo "tag=${GITHUB_REF_NAME}" >> "$GITHUB_OUTPUT"
          else
            echo "tag=${{ github.event.inputs.tag }}" >> "$GITHUB_OUTPUT"
          fi

      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # --- base images (built from the pinned submodule) ---
      - name: Build & push donna-api-base
        uses: docker/build-push-action@v6
        with:
          context: vendor/lq-ai/api
          platforms: ${{ env.PLATFORMS }}
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-api-base:${{ steps.meta.outputs.tag }}

      - name: Build & push donna-gateway-base
        uses: docker/build-push-action@v6
        with:
          context: vendor/lq-ai/gateway
          platforms: ${{ env.PLATFORMS }}
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-gateway-base:${{ steps.meta.outputs.tag }}

      # --- Donna-published images ---
      - name: Build & push donna-api (skills baked)
        uses: docker/build-push-action@v6
        with:
          context: vendor/lq-ai
          file: docker/api.Dockerfile
          build-args: |
            BASE=${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-api-base:${{ steps.meta.outputs.tag }}
          platforms: ${{ env.PLATFORMS }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-api:${{ steps.meta.outputs.tag }}
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-api:latest

      - name: Build & push donna-gateway (config baked)
        uses: docker/build-push-action@v6
        with:
          context: vendor/lq-ai
          file: docker/gateway.Dockerfile
          build-args: |
            BASE=${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-gateway-base:${{ steps.meta.outputs.tag }}
          platforms: ${{ env.PLATFORMS }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-gateway:${{ steps.meta.outputs.tag }}
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-gateway:latest

      - name: Build & push donna-web
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          platforms: ${{ env.PLATFORMS }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-web:${{ steps.meta.outputs.tag }}
            ${{ env.REGISTRY }}/${{ env.NAMESPACE }}/donna-web:latest
```

- [ ] **Step 2: Lint the workflow**

If `actionlint` is available (`which actionlint`), run `actionlint .github/workflows/release.yml` and expect no errors. Otherwise, validate YAML parses:

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('workflow yaml: valid')"
```

Also run `npx prettier --write .github/workflows/release.yml` and confirm `npm run lint` is green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(images): release workflow — multi-arch build + push to ghcr.io/legalquants"
git push
```

(Note: this workflow can only be exercised by GitHub Actions on a tag push or manual dispatch — not from here. The image-build logic it runs is the same proven locally in Task 3.)

---

### Task 5: README "Quick install (pre-built)" section

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Insert the section above "Run the full stack"**

Find the `## Run the full stack` heading and insert this **before** it:

````markdown
## Quick install (pre-built images)

The fastest way to run Donna — no clone, no submodules, no build. You need only **Docker + Compose v2**.

```bash
# 1. Get the release compose file and an env template
curl -O https://raw.githubusercontent.com/LegalQuants/Donna/main/docker-compose.release.yml
curl -o .env https://raw.githubusercontent.com/LegalQuants/Donna/main/.env.example

# 2. Edit .env — set the required secrets (POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD,
#    S3_*, LQ_AI_GATEWAY_KEY, JWT_SECRET). Pin a release with DONNA_IMAGE_TAG=v0.1.0
#    (default: latest). Add ANTHROPIC_API_KEY / OPENAI_API_KEY for cloud inference,
#    or leave them blank and use a local Ollama model (see Models in the app).

# 3. Start the stack (pulls pre-built images from ghcr.io/legalquants)
docker compose -f docker-compose.release.yml up -d
```

Then create a login-ready admin and sign in (same as below):

```bash
docker compose -f docker-compose.release.yml exec api \
  python -m app.cli reset-admin-password \
  --email admin@lq.ai --password 'DonnaE2ePassw0rd!' --no-force-change
```

Open **http://localhost:13002** and sign in with `admin@lq.ai` / `DonnaE2ePassw0rd!`.

Images are published from this repo to GHCR — `ghcr.io/legalquants/donna-web`, `donna-api`, and
`donna-gateway` (multi-arch: Intel/AMD + Apple Silicon). This still needs a filled `.env`; it removes
the *build*, not the *config*. For a fully free, no-cloud setup, leave the provider keys blank and run
a local model via Ollama. Deploying beyond `localhost` still requires TLS in front of `donna-web` (see
the note under "Run the full stack").

> **Prefer to build from source / develop on Donna?** Use the clone + build instructions below.
````

- [ ] **Step 2: Format + verify**

```bash
npx prettier --write README.md && npm run lint 2>&1 | tail -3
```

Expected: lint green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README quick-install section for pre-built images"
git push
```

---

### Task 6: Route 1 upstream-request hand-off doc

**Files:**

- Create: `docs/upstream-requests/lq-ai-publish-container-images.md`

- [ ] **Step 1: Create the doc**

```markdown
# Upstream request — LQ-AI: publish container images to GHCR

**Status:** Proposed (not yet relayed). **For:** the LQ-AI maintainers / their coding assistant.
**Why it exists:** Donna v0.1.0 self-publishes the backend images as a one-off (it layers the skills
corpus + a default gateway config onto images it builds from the pinned `lq-ai` submodule — see
`docs/superpowers/specs/2026-06-11-prebuilt-container-images-design.md`, "Route B"). That works but
makes Donna re-publish backend images on every pin bump. If LQ-AI publishes its own images, Donna can
switch to **Route 1**: consume upstream images and delete its wrapper images + their CI.

## The ask

Publish the `api` and `gateway` service images to GHCR (or any public registry) on each release:

1. **`ghcr.io/legalquants/lq-ai-api`** — the `api/` image, **with the skills corpus baked in** at
   `/skills` (env `LQ_AI_SKILLS_DIR=/skills`). Today the corpus (the nested `lq-skills` submodule) is
   bind-mounted via `./skills:/skills:ro`; baking it in is what lets the `api`/`ingest-worker`/
   `arq-worker` run with no mount. Migration 0032 reads `/skills/playbooks/nda/playbook.yaml`, and the
   `arq-worker` startup registry needs the corpus — both must find it in the image.
2. **`ghcr.io/legalquants/lq-ai-gateway`** — the `gateway/` image, **with a sensible default
   `gateway.yaml.example` baked in** at `/usr/share/lq-ai/gateway.yaml.example` (the path the
   entrypoint seeds `/etc/lq-ai/gateway.yaml` from on first boot). Today it's bind-mounted.

### Requirements

- **Multi-arch:** `linux/amd64` + `linux/arm64`.
- **Tags:** the release version (e.g. `v0.5.0`) **and** the commit SHA, so a consumer can pin exactly
  the way Donna pins the submodule. A moving `latest` is fine additionally.
- **Public** packages (so an unauthenticated `docker pull` works for self-hosters).
- **Provenance:** built from the tagged source in CI (GitHub Actions `docker/build-push-action`,
  `GITHUB_TOKEN` with `packages: write`).

### Acceptance criteria

- `docker pull ghcr.io/legalquants/lq-ai-api:<tag>` and `…/lq-ai-gateway:<tag>` succeed
  unauthenticated, on both arches.
- A stack using only those images (no `./skills` / `gateway.yaml` mounts) comes up healthy and a
  `skill_ref` autonomous run completes (proves the baked skills resolve on the worker).
- The image digests are reproducible from the tagged commit.

## How Donna consumes it afterwards (Route 1)

When these images exist, Donna:

1. Deletes `docker/api.Dockerfile`, `docker/gateway.Dockerfile`.
2. Trims `.github/workflows/release.yml` to build only `donna-web` (drops the two base + two wrapper
   builds).
3. Repoints `docker-compose.release.yml`: `api`/`ingest-worker`/`arq-worker` →
   `ghcr.io/legalquants/lq-ai-api:<pinned>`, `gateway` → `ghcr.io/legalquants/lq-ai-gateway:<pinned>`,
   pinned to the same SHA recorded in `docs/decisions/lq-ai-pin.md`.
4. Drops the "hand-maintained mirror" maintenance note from CLAUDE.md for those services.

This removes Donna's only piece of backend-image maintenance and keeps each project owning its own
images.
```

- [ ] **Step 2: Format + commit**

```bash
npx prettier --write docs/upstream-requests/lq-ai-publish-container-images.md
git add docs/upstream-requests/lq-ai-publish-container-images.md
git commit -m "docs(upstream): Route 1 ask — LQ-AI publish api/gateway images to GHCR"
git push
```

---

### Task 7: Roadmap + CLAUDE.md updates

**Files:**

- Modify: `docs/roadmap/donna-future-roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Container images" entry to the roadmap**

In `docs/roadmap/donna-future-roadmap.md`, under "## Buildable now (no backend dependency)" (or a new
"## Distribution" section above it), add:

```markdown
## Distribution / container images

- **Pre-built images shipped (Route B, v0.1.0).** Donna self-publishes `donna-web`, `donna-api`
  (skills baked), and `donna-gateway` (config baked) to `ghcr.io/legalquants/*` via
  `.github/workflows/release.yml`, with a `docker-compose.release.yml` for one-command install. The
  `api`/`gateway` images are thin Donna wrappers over images built from the pinned `lq-ai` submodule.
- **Route 1 — consume upstream images (future).** When LQ-AI publishes its own `api`/`gateway` images
  to GHCR (ask filed at `docs/upstream-requests/lq-ai-publish-container-images.md`), Donna should drop
  the wrapper images + their CI and point the release compose at the upstream images — removing
  Donna's only backend-image maintenance. This is the cleaner long-term division of ownership; the
  hand-off instructions live in that upstream doc.
```

- [ ] **Step 2: Add a distribution note to CLAUDE.md**

In `CLAUDE.md` §5 (Dev stack), after the gates block, add:

```markdown
### Distribution (pre-built images)

Releases publish three multi-arch images to `ghcr.io/legalquants/*` via
`.github/workflows/release.yml` (on a `v*` tag or manual dispatch): `donna-web` (from `Dockerfile`)
and two **wrappers** — `donna-api` (lq-ai api + baked `vendor/lq-ai/skills`) and `donna-gateway`
(lq-ai gateway + baked `gateway.yaml.example`), built via `docker/*.Dockerfile` so the submodule stays
untouched. `docker-compose.release.yml` is the image-only install stack — a **hand-maintained mirror**
of the dev compose's service wiring; **re-sync it on a pin bump**. When LQ-AI publishes its own
images, switch to Route 1 (see `docs/upstream-requests/lq-ai-publish-container-images.md`) and this
maintenance goes away.
```

- [ ] **Step 3: Format + verify + commit**

```bash
npx prettier --write docs/roadmap/donna-future-roadmap.md CLAUDE.md && npm run lint 2>&1 | tail -3
git add docs/roadmap/donna-future-roadmap.md CLAUDE.md
git commit -m "docs: roadmap + CLAUDE.md — pre-built images (Route B) and the Route 1 path"
git push
```

---

## Final verification checklist (orchestrator)

- [ ] Task 3 local e2e passed: all 8 services healthy from `docker-compose.release.yml`, baked skills + gateway config in use, real-browser login green — captured in the PR description.
- [ ] `docker compose -f docker-compose.release.yml config` parses; `release.yml` lints; `npm run lint` fully green across the new `.md`/`.yml` files.
- [ ] PR description states the one honest limit: the **multi-arch GHCR publish runs only in CI** on a tag/dispatch; to mint `v0.1.0` images, run the workflow via `workflow_dispatch` (ref `v0.1.0`, tag `v0.1.0`) or push a new tag.
- [ ] Whole-branch review (Opus) → PR with a **merge commit**.
```
