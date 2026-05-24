# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `8b8e5496e7464d3e15fb8890ad9ebdde4257e724`
- Captured: 2026-05-24
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.

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

## Known follow-ups

- Upstream lq-ai `backend-openapi.yaml` uses backticks in plain YAML scalars, which
  breaks the codegen parser; `scripts/sanitize-openapi.js` works around it at
  `npm run gen:api` time. Worth an upstream fix (quote those scalars).
- Donna's refresh-cookie TTL is 8h (`REFRESH_TTL_SECONDS`) while lq-ai's refresh
  token default is 7d (`JWT_REFRESH_TOKEN_TTL_SECONDS=604800`) — users re-auth sooner
  than necessary. Consider aligning when chat/session UX lands in P2.
