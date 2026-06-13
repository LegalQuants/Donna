# Decision — Desktop launcher (Donna for Mac)

**Date:** 2026-06-13

A native macOS launcher that orchestrates `docker-compose.release.yml` so a non-technical
user installs and runs Donna by double-clicking — no terminal, GitHub, or hand-edited `.env`.

**Resolved choices (Phase 1):**

- **Shell: Electron** (not Tauri). Keeps one JS/TS toolchain shared with `donna-web`; footprint
  cost accepted. Lives in top-level `desktop/`, builds nothing from `vendor/`.
- **Engine: detect-and-guide** (Phase 1). The app requires Docker; if absent it links to Docker
  Desktop. Bundled Colima/Podman is Phase 2.
- **Image tag: pinned** (`v0.1.0`), not `latest` — updates are deliberate.
- **Inference default: cloud API key**, Ollama one click away.

**Cardinal-rule compliance:** the launcher shells out to the unchanged release compose and the
published images. It reimplements no backend or web behavior; anything it lacks is a normal Donna
feature or an upstream request, never launcher-special backend code (CLAUDE.md §1/§8).

**Phasing:** Phase 1 (this) = detect-Docker launcher + wizard + control panel, signed/notarized
`.dmg`. Phase 2 = bundled engine. Phase 3 = auto-update + GHCR update surfacing + resource controls.

**Architecture:** a pure, unit-tested core (`desktop/src/core/`: secret-gen, env-render, port
resolution, compose-argv, engine-probe, state derivation) consumed by a thin Electron layer
(`src/main`/`preload`/`renderer`). Packaged/signed/notarized by
`.github/workflows/desktop-release.yml`.

Design doc: `docs/superpowers/plans/20260613desktoplauncherappdesign.md`.
Plan: `docs/superpowers/plans/2026-06-13-desktop-launcher-phase1.md`.
