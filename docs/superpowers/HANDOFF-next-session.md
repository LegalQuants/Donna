# Donna — Handoff for the next session

**Date:** 2026-06-14 · **`main` @ `17c1f99`** · **Pin:** `vendor/lq-ai` @ `c4d4482`.
**Gates:** `npm run check` 0/0 · `npm run lint` green · root `npx vitest run` passing · `desktop/`:
`npx vitest run` 45 · `npx tsc --noEmit` 0. **Merge PRs with MERGE COMMITS** (never squash —
`.git-blame-ignore-revs`). Mirror `main` + tags to the `tucuxi` remote (`Tucuxi-Inc/Donna`).

## Where things stand — v0.1.0 public + the macOS launcher shipped 🎉

- **v0.1.0 is shipped and PUBLIC.** All 5 `ghcr.io/legalquants/donna-*` images are **public** (anonymous
  pull verified). Both README install paths work for anyone: **Option A** the desktop app, **Option B**
  `docker-compose.release.yml`.
- **"Donna for Mac" desktop launcher — Phase 1 COMPLETE & verified live.** Signed + notarized
  `Donna-0.1.0-arm64.dmg` (Developer ID: **Tucuxi, Inc. `MC8BT9Z8GD`**) on the **`desktop-v0.1.0`**
  release. A clean-Mac run passed end-to-end (install → wizard → isolated `donna-desktop` stack →
  login → stop/relaunch/engine-absent). Lives in top-level `desktop/` (pure tested core + thin Electron
  glue); wraps `docker-compose.release.yml`; never forks `donna-web`/backend.
- **Docs are complete and current:**
  - `docs/INSTALL-MAC.md` — illustrated end-user install guide (screenshots in `docs/images/desktop/`).
  - **`docs/BUILD-AND-RELEASE.md` — READ THIS to cut any release** (images + signed Mac app): the full
    notarization recipe + every first-real-launch gotcha. Generic on signing.
  - `docs/upstream-requests/lq-ai-macos-launcher-playbook.md` — self-contained playbook for LQ-AI CC to
    do the same for LQ-AI (it owns its code → publishes its own images, no wrappers).
  - `desktop/VERIFICATION.md` — the live Task-13 evidence. `docs/decisions/desktop-launcher.md` — decisions.
  - Design/plan: `docs/superpowers/plans/2026-06-13-desktop-launcher-phase1.md` (+ the design doc).

## How to ship the next release (the short version)
- **Images:** `gh workflow run release.yml -R LegalQuants/Donna -f ref=main -f tag=vX.Y.Z` → flip the 5
  GHCR packages public (org owner gate) → verify anonymous pull. Re-sync `docker-compose.release.yml` on
  a pin bump.
- **Mac app:** `gh workflow run desktop-release.yml -R LegalQuants/Donna -f tag=desktop-vX.Y.Z` → verify
  the **published** dmg with `spctl -a -t open --context context:primary-signature` (trust this + `gh run
  view --json conclusion`, **not** `gh run watch`, which can falsely report success).
- The 5 signing secrets are already on `LegalQuants/Donna` (and `LegalQuants/lq-ai`). **Full recipe +
  the four real-run bugs we fixed: `docs/BUILD-AND-RELEASE.md`.** Don't re-derive them.

## Open threads / what's next for Donna (all optional, nothing blocking)
- **Desktop Phase 2** — bundle/manage Colima or Podman so Docker isn't a prerequisite (true
  double-click). **Phase 3** — `electron-updater` auto-update + GHCR release surfacing; **x64/universal**
  build for Intel (user deferred 2026-06-13); control-panel polish. **Windows** — a DEFINED phase in the
  roadmap (NSIS + `windows-latest` CI; a Windows code-signing cert is THE long pole). See
  `docs/roadmap/donna-future-roadmap.md`.
- **Convenience:** ask a LegalQuants **org owner** (Jamie/Ray) to set the 5 signing secrets at the **org
  level** (scoped to all repos) so per-repo setup never repeats. (Org-owner gate, like the package-public
  flip.)
- **Pre-existing roadmap items:** feature screenshots for README/About (hero-only today); PR #72 cosmetic
  nits; richer autonomous-artifact rendering (upstream DE-332); matters depth (folder tree / versions /
  sharing — needs a backend contract). All in `docs/roadmap/donna-future-roadmap.md`.
- **New LQ-AI capabilities** as they ship: brainstorm → confirm contract via `gen:api` → mirror the
  closest analog. Pin-bump recipe/log: `docs/decisions/lq-ai-pin.md`.

## Reminders
- LQ-AI's own launcher/images/release (`LegalQuants/lq-ai`, `desktop-v0.4.0`, `lq-ai-*` images) are the
  **LQ-AI CC session's** domain — not Donna's. Don't touch them from here.
- Repo is PUBLIC. Build the loop: brainstorm → spec → plan → subagent-driven execution → whole-branch
  review → PR (merge commit). Always `git fetch` before committing to `main`.
- Memory: [[donna-desktop-launcher]] (the launcher, the notarization recipe, the real-run gotchas),
  [[donna-phase-status]], [[donna-workflow]], [[donna-dev-stack]].
