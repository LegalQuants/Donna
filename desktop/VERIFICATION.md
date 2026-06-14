# Donna for Mac — Phase 1 real-run verification (Task 13)

**What this proves:** on a Mac with Docker but **no Donna repo cloned**, the signed/notarized
`.dmg` installs, the wizard generates config + creates a login + starts the released stack, the
window reaches the authed app, and lifecycle (stop / relaunch / engine-absent) behaves.

**Artifact under test:** `Donna-0.1.0-arm64.dmg` from the
[`desktop-v0.1.0`](https://github.com/LegalQuants/Donna/releases/tag/desktop-v0.1.0) release
(Developer ID: Tucuxi, Inc. — signed, notarized, stapled; images public on `ghcr.io/legalquants`).

> Run on a **clean Mac**, or on a machine where the dev stack is **stopped** first (the launcher
> uses compose project `donna`, which collides with the build-from-source dev stack).

Fill in each result (✅/❌ + note). Commit this file once complete as the Task 13 evidence.

## Automated published-image pre-check (backend, done 2026-06-13) — ✅ PASSED

Independent of the GUI launcher, the **published `v0.1.0` images** were verified to stand up to a
working login (isolated project `donna-reltest`, shifted ports, fresh anonymous pull):

- All 5 `ghcr.io/legalquants/donna-*:v0.1.0` images **publicly pullable** (anonymous HTTP 200).
- `docker compose -f docker-compose.release.yml` (pinned `v0.1.0`) → **all 8 services Healthy**.
- Admin fixture created the login; `GET /login` → 200.
- `POST /login?/login` through the donna-web BFF (with `Origin` header) → **session tokens issued**
  (`donna_at` + `donna_rt`, HttpOnly/Secure) = real end-to-end auth against gateway/api.

This confirms the backend the launcher drives works for a fresh install. The GUI steps below
exercise the launcher *chrome* (wizard, lifecycle, window) on top of that proven backend.

## Environment (run 2026-06-13)
- Mac: Apple Silicon (arm64), MacBook Pro.
- Docker Desktop installed and running.
- Clean slate: the `donna-desktop` containers + volumes and the launcher app-data
  (`config.enc` + `.env`) were fully removed before the run, so first-launch behaved like a
  new machine (images were cached, so no multi-GB image re-pull — the cold pull itself was
  separately proven by the automated pre-check above).

## Steps & results — ✅ ALL PASSED

- [x] **Install** — `.dmg` opened, `Donna.app` → Applications, launched — **no Gatekeeper warning** (Developer ID: Tucuxi, Inc.).
- [x] **Wizard** — set a password (login shown as `admin@lq.ai`), picked inference, **Start Donna** — no terminal, no hand-edited `.env`.
- [x] **Live progress** — wizard showed live "N/8 services ready" (honest state, not a fake "ready").
- [x] **Healthy** — reached **Running**; **Open Donna** enabled (~1 min, images cached).
- [x] **Open Donna** — window loaded `http://localhost:13002` login page.
- [x] **Login** — signed in with `admin@lq.ai` + the wizard password → reached the authed app.
- [x] **Stop** — panel → **Stopped**, stack down.
- [x] **Relaunch** — reopened → **no wizard** (config reused) → **Start** back to **Running**.
- [x] **Engine-absent** — quit Docker → panel reads **Docker is not running** with install guidance (no crash, no fake ready).

User confirmation (2026-06-13): *"Works great all steps check out."*

## Bugs found by THIS live run and fixed before sign-off
The signed-dmg's first real Finder launch surfaced four issues the automated/CI tests could
not (CI runs `docker` from a full-PATH shell), all fixed and merged (PRs #80, #81):
1. **GUI PATH** — Finder apps omit `/usr/local/bin`, so `spawn('docker')` ENOENT'd even with
   Docker installed → crash + false "Docker is not installed". (`dockerSearchPath` + a missing
   `streamDocker` error handler.)
2. **Project/volume collision** — launcher project `donna` reused the dev stack's `donna_pgdata`
   volume → Postgres password mismatch → `api` crash-loop. (Now isolated project `donna-desktop`.)
3. **Stranded config** — config was persisted before the stack started, skipping the wizard after
   a failed run. (Now persisted only after healthy + admin created.)
4. **Wizard vs backend** — the backend has only a fixed `admin@lq.ai` + `reset-admin-password`
   (no create-user), and the exit code wasn't checked → "Running" with no usable login. (Wizard
   now sets the `admin@lq.ai` password and fails loudly on error.)

## Verdict
✅ **Phase 1 launcher delivers "no terminal, no GitHub, no `.env`" on a clean Mac.** Verified live.

## Known follow-ups (non-blocking)
- A **Reset / Uninstall** control-panel action that also runs `down -v` — deleting app config
  alone leaves volumes whose old Postgres password collides with a re-run's fresh secrets.
- `x64` / universal build for Intel Macs (arm64-only today).
- Live progress wired into the control panel as well (wizard has it).
