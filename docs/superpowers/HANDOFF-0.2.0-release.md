# Handoff — Donna 0.2.0 release (legal research + MCP)

**Date:** 2026-06-21. **Read with:** memory `donna-legal-research-mcp-milestone.md`,
`docs/decisions/lq-ai-pin.md`, `CLAUDE.md`, `docs/BUILD-AND-RELEASE.md`,
`.superpowers/sdd/progress.md` (Slice F ledger).

## Where we are

The **legal research + MCP milestone is code-complete and merged.** `main` @ `8c0a8e0`
(`package.json` 0.2.0), mirrored to `tucuxi`. Pin lq-ai `658fdbc`.

- **Slices A–F all merged** (#84/#86/#85/#87/#88/#89/#90/#91/#92/#93 + release-prep #94):
  - A research workspace + pagination · B MCP admin · B2 Connections · C governed chat tool-loop ·
    D external-source citations + skill tool-usage · E in-app discoverability + empty-response
    fallback · **F zero-config research wiring** (bring-a-token turnkey CL; gateway skips an un-keyed
    provider; desktop wizard CL field + `imageTag` v0.2.0; MCP plumbed, no defaults).
- **In-app `/about` + static docs (README/PRODUCT/CHANGELOG/GUIDE) refreshed.**
- **Release-dry-run STEP 1 (source build) PASSED:** clean-slate `down -v --rmi` → `up --build` from
  main → 8/8 healthy, migration 0055, admin fixture, browser login + chat OK.
- **`v0.2.0` tag + GitHub release created (2026-06-21); the "Release container images" workflow is
  RUNNING** (push-tag trigger; run id ~27918548540; ~40 min). Builds + publishes
  `ghcr.io/legalquants/donna-{web,api,gateway}` + the two `-base` images at `v0.2.0`.

## Remaining release steps (in order)

1. **Wait for the image workflow to finish + succeed.**
   `gh run list --workflow="Release container images" --limit 1` → completed/success.
   `gh run watch <id>` to follow. If it fails, read the logs (`gh run view <id> --log-failed`).

2. **Release-image dry-run = Slice F Task 5 (the turnkey verification).** As a FRESH USER, in a temp
   dir (NOT the repo, to mimic no-clone):
   - `curl -O .../main/docker-compose.release.yml`; `curl -o .env .../main/.env.example`; fill the
     required secrets + `DONNA_IMAGE_TAG=v0.2.0`; set `OLLAMA_BASE_URL=http://host.docker.internal:11434`
     (or provider keys); **set `COURTLISTENER_API_TOKEN`** (from the dev `.env`).
   - Use a distinct project (`-p donna-rel`) + shifted ports to avoid colliding with the dev stack.
   - `docker compose -p donna-rel -f docker-compose.release.yml up -d` (pulls the v0.2.0 images);
     run the admin fixture; open the browser.
   - **VERIFY TURNKEY:** with the token set → `/research` enabled + a case-law search returns results
     (no `gateway.yaml` edit). Then **flip it:** remove `COURTLISTENER_API_TOKEN`, recreate the
     gateway → it starts clean + `/research` shows "not enabled" (logs the skip warning, no crash).
   - Note: making the GHCR packages public is needed for an anonymous pull, but YOU are authenticated,
     so the pull works for the dry-run before they're public.

3. **Make the 5 `ghcr.io/legalquants/donna-*` v0.2.0 packages PUBLIC.** ⚠️ **ORG-OWNER-GATED** — a
   member/`repo`-scope token CANNOT; org Settings → Packages must allow public, then set each package's
   visibility to Public (Jamie/Ray, same as 0.1.0). Verify anonymous pull:
   `docker pull ghcr.io/legalquants/donna-web:v0.2.0` from a logged-out Docker.

4. **macOS DMG (`desktop-v0.2.0`).** Follow `docs/BUILD-AND-RELEASE.md` (hard-won signing/notarization
   recipe). The desktop already pins `imageTag` v0.2.0 (Slice F) + has the optional CL-token wizard
   field. Build → sign (Tucuxi cert `MC8BT9Z8GD`) → notarize → staple → publish as the `desktop-v0.2.0`
   GitHub release (README already points the DMG link at `Donna-0.2.0-arm64.dmg` / `desktop-v0.2.0`).
   **Fresh-Mac install test:** download the DMG → drag to Applications → open → wizard (Docker + Ollama
   only; optionally paste a CL token) → it stands up + browser works; with the CL token, research works.
   (See [[donna-desktop-launcher]] for Phase-1 gotchas: GUI-PATH docker detection, `donna-desktop`
   project isolation, fixed `admin@lq.ai`.)

## Gotchas (carry these)

- **Merge commits only to main; mirror `tucuxi` every time.**
- `docker compose up -d --build donna-web` cascades `--build` to deps (api) — if the api pip build
  flakes the `up` aborts + drops the stack; rebuild donna-web isolated (`build donna-web` +
  `up -d --no-deps donna-web`), and reset the admin fixture after any api restart.
- `desktop/resources/docker-compose.release.yml` is **gitignored** — generated from root via
  `prepack:compose` at desktop build; never commit it.
- Model selection persists in browser `localStorage` (`donna.model`), not server-side.
- Local `qwen3.5:4b` (ollama-local, tier 1) intermittently returns empty content in the tool-loop —
  upstream-flagged (`docs/upstream-requests/lq-ai-transparency-followups.md` item 5); the Slice E
  empty-response fallback covers the UX.
- Upstream follow-ups for LQ-AI (none blocking): `docs/upstream-requests/lq-ai-transparency-followups.md`.

## When fully done

Tag is `v0.2.0` (images) + `desktop-v0.2.0` (DMG). Update memory `donna-phase-status.md` to mark
0.2.0 shipped; confirm both README install paths (Option A DMG + Option B compose) work for a fresh
user.
