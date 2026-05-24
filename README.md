# Donna

Donna is a standalone, [MikeOSS](https://github.com/willchen96/mike)-inspired frontend for the **[LQ.AI](https://github.com/LegalQuants/lq-ai)** legal-AI backend: conversational chat with **character-verified citations**, anonymization, inference-tier awareness, audit, and skill transparency — under a clean, document-forward interface. Donna is a fresh **SvelteKit** app that talks to the lq-ai backend only through its published API, and it vendors that backend (as a git submodule) so the whole product runs together.

This repository currently implements **Phase P0 + P1**: project foundation, the BFF auth/session layer, the global app shell, login (+ MFA + first-run password change), and the assistant landing that creates a chat. See the design spec at [`docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md`](docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md) and the roadmap therein for later phases.

## Architecture (one paragraph)

The browser talks only to Donna's SvelteKit server (a **backend-for-frontend**). The SvelteKit server holds the lq-ai JWT access + refresh tokens in **httpOnly cookies**, attaches `Authorization: Bearer` when proxying to the lq-ai `api`, and transparently refreshes on `401`. This means no CORS, and the JWT never reaches client JavaScript. The lq-ai backend is vendored at `vendor/lq-ai` (pinned submodule) and brought up by this repo's `docker-compose.yml`, which `include`s lq-ai's compose and adds Donna's web service (`donna-web`).

## Prerequisites

- **Docker** + Docker Compose v2 (for the bundled backend).
- **Node 22+** (for local dev / tooling).

## Setup

```bash
# 1. Clone WITH submodules (pulls vendor/lq-ai)
git clone --recurse-submodules https://github.com/LegalQuants/Donna.git
cd Donna
#    (if already cloned without submodules:)
git submodule update --init --recursive

# 2. Install deps
npm install

# 3. Generate the typed API client from lq-ai's OpenAPI specs
npm run gen:api

# 4. Create your env file (dev secrets + host ports)
cp .env.example .env
#    Edit .env: set the required secrets (POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD,
#    S3_*, LQ_AI_GATEWAY_KEY, JWT_SECRET). The *_HOST_PORT values are pre-shifted
#    so Donna can run ALONGSIDE a separate lq-ai dev stack on the default ports.
```

## Run the full stack (Donna web + bundled lq-ai backend)

Donna runs as its own compose project (`donna`) on **shifted host ports**, so it won't collide with a separate lq-ai dev stack running on the defaults. Bring up only the services the app needs (this deliberately omits lq-ai's own `web`, the ingest/arq workers, and inference services):

```bash
docker compose up -d --build postgres redis minio gateway api donna-web
```

With the default `.env`, Donna is then at **http://localhost:13002** (the lq-ai `api` is at `http://localhost:18000`).

> **Why not `docker compose up` (everything)?** Compose v2 `include:` won't let us override lq-ai's `web` service, so it still exists in the merged spec. Starting the explicit service list above avoids building/running it. (lq-ai's `web` host port is also shifted to `WEB_HOST_PORT=13000` in `.env` as a backstop.)

### First-run admin (login-ready fixture)

On first boot the api auto-creates an admin (`admin@lq.ai`) with a random password and `must_change_password=true` (printed to the api logs). For a directly-usable login (dev/test), set a known password and clear the change-password flag with lq-ai's CLI:

```bash
docker compose exec api python -m app.cli reset-admin-password \
  --email admin@lq.ai --password 'DonnaE2ePassw0rd!' --no-force-change
```

Then sign in at http://localhost:13002 with `admin@lq.ai` / `DonnaE2ePassw0rd!`. (To exercise the real first-run flow instead, retrieve the printed password with `docker compose logs api 2>&1 | grep "First-run admin password"` and you'll be routed through the change-password screen.)

## Verify

```bash
npm run check        # svelte-check — 0 errors
npx vitest run       # unit/component tests
npx playwright test  # e2e — requires the stack up + the admin fixture above
```

The e2e reads `DONNA_BASE_URL`, `DONNA_E2E_EMAIL`, `DONNA_E2E_PASSWORD` from `.env` (or the environment).

> Running `npm run check` prints a harmless `ERR_MODULE_NOT_FOUND` referencing `vendor/lq-ai/...`; svelte-check recovers and the run still reports `0 ERRORS` and exits 0. The vendored backend is excluded from svelte-check/ESLint/Prettier.

## Development (without Docker for the frontend)

You can run the SvelteKit dev server on the host against the compose-hosted api:

```bash
LQ_API_INTERNAL_URL=http://localhost:18000 npm run dev
```

## Layout

```
src/                  SvelteKit app (routes, lib, BFF server code, hooks)
src/lib/server/       server-only: session cookies, authed lqClient, auth wrappers
src/lib/api/          generated OpenAPI types (npm run gen:api)
vendor/lq-ai/         pinned lq-ai backend (git submodule)
docs/                 design spec, implementation plan, decisions
tests/                Playwright e2e
```
