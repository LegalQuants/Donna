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
