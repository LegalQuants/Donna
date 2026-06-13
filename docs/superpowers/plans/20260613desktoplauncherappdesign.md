# Desktop launcher app — "Donna for Mac" (design)

**Date:** 2026-06-13 · **Branch:** `claude/determined-meitner-evujdl` · **Goal:** let a non-technical
user install and run Donna by double-clicking an app — no terminal, no GitHub, no hand-edited `.env` —
by wrapping the **existing pre-built image stack** in a native desktop launcher.

## Problem

Even after pre-built images shipped (`docs/superpowers/specs/2026-06-11-prebuilt-container-images-design.md`),
the lowest-barrier install still reads: *download two files, copy `.env.example` to `.env`, fill in
secrets, `docker compose -f docker-compose.release.yml up -d`, then run an admin-fixture command.* That's
a terminal flow with a hand-edited config file — a wall for the audience Donna targets (solo
practitioners, legal-aid staff, students). The ask from the field is blunt: *"something that doesn't
require the user to go on their terminal or GitHub to set it up."*

This spec is the answer **we can actually build without violating Donna's architecture**: a native
desktop **launcher / control panel** that owns the lifecycle of the release stack and presents Donna in
its own window. macOS is the first (and, for v1, only) target.

## What this is — and what it deliberately is not

This is a thin **orchestrator over the existing `docker-compose.release.yml`**. It detects/uses a
container engine, generates and stores the secrets, runs the stack, runs the first-run admin fixture,
and opens a native window at `http://localhost:13002`. It manages start/stop/update/logs through a UI.

It is **not**:

- **Not a reimplementation of any backend logic.** The legal-AI engine stays in lq-ai, consumed only
  through the published images — same cardinal rule as everywhere else in this repo (CLAUDE.md §1).
- **Not a fork of `donna-web`.** The launcher loads the *same* SvelteKit BFF the browser would; the BFF,
  auth, and trust boundary are unchanged. The desktop window is just a different chrome around
  `localhost:13002`.
- **Not a Docker-free, self-contained binary.** Bundling the Python/ML backend (Docling + HuggingFace
  embeddings + EasyOCR, multi-GB) natively would mean repackaging lq-ai's runtime — exactly the coupling
  §1/§8 forbid. The realistic win is *hiding* the container engine, not eliminating it. (See the
  feasibility framing in §"Why a launcher, not a true native app".)

## Why a launcher, not a true native app

Donna's UI (`donna-web`) is a single `adapter-node` Node server — trivially wrappable. But it is inert
without the full release stack: **postgres** (pgvector), **redis**, **minio**, **gateway**, **api**, and
two Python workers — **ingest-worker** (Docling/HF/EasyOCR, multi-GB model downloads cached in
`ingest-hf-cache`/`ingest-easyocr-cache` volumes) and **arq-worker**. The setup pain users feel is
*standing up that backend*, not *opening a browser*. So an Electron/Tauri shell that only replaces the
browser solves the wrong 5%. The launcher's real job is to drive the 8-service stack on the user's
behalf — which the release compose already makes a one-command operation. We're putting a wizard and a
lifecycle UI in front of that command.

## Constraints (carried from the project's rules)

- **Never edit `vendor/lq-ai`; never fork `donna-web`.** The launcher shells out to compose and loads
  the same web image. No backend behavior is reimplemented.
- **The release compose is the source of truth.** The launcher generates a `.env` and invokes
  `docker-compose.release.yml`; it does not maintain its own service wiring. When the release compose is
  re-synced on a pin bump, the launcher inherits it for free.
- **Honest degradation + faithful status.** The launcher reports real engine/stack state (not-installed,
  starting, downloading models, healthy, failed) from `docker compose ps`/healthchecks — never a fake
  "ready". The first-run model download is slow and must be shown, not hidden behind a spinner that lies.
- **Secrets never sit in plaintext where avoidable.** Generated secrets go to the OS keychain; the `.env`
  the launcher writes is `chmod 600` in the app's data dir, not the user's repo.

## Approach

### Tech choice — Tauri (recommended) over Electron

Recommend **Tauri** (Rust core + system WebView2/WKWebView, ~10 MB app) rather than Electron (~150 MB,
bundles Chromium + a second Node runtime). Rationale specific to *this* app:

- The window is just a view onto an already-running web server (`localhost:13002`); we don't need a
  bundled Chromium or Node — the OS webview is enough.
- The actual work is **process orchestration** (spawn/inspect `docker`/compose, manage a VM), which Tauri
  does cleanly from Rust with a small, auditable surface and good signing/notarization/auto-update story
  (`tauri-plugin-updater`, Keychain access).
- Smaller download = lower barrier, which is the entire point.

Electron is the fallback if the team's familiarity outweighs the footprint — the design below is
engine-agnostic. **This is the one technology decision to confirm before Phase 1.**

### The launcher's responsibilities (a lifecycle state machine)

The Rust core owns a small state machine surfaced in the UI:

```
NO_ENGINE → ENGINE_STARTING → STACK_PROVISIONING (first run: pulling images)
  → STACK_STARTING → MODELS_DOWNLOADING (first ingest-worker run) → HEALTHY ⇄ STOPPED → FAILED
```

State is derived from real signals: engine probe (`docker info`), `docker compose -f <release> ps
--format json`, and the per-service healthchecks already defined in `docker-compose.release.yml`. The
window only navigates to Donna once `donna-web` reports healthy (its `/login` healthcheck), mirroring the
compose `depends_on: service_healthy` ordering. Last-known-good UI state is kept on transient probe
failures (same discipline as the live pollers in the app).

### Container-engine strategy (the key scope fork — phased)

True "zero prerequisites" requires bundling a Linux container engine inside the `.app`. That's the
heaviest part and where scope can balloon, so phase it:

- **Phase 1 — detect & guide (ships fast).** On launch, probe for a working Docker engine. If absent,
  the wizard explains and links to Docker Desktop (or offers to download it). We do not bundle an engine
  yet. This already removes the terminal and `.env` editing — the biggest wins — for users who have or
  can install Docker.
- **Phase 2 — managed engine (true zero-terminal).** Bundle and manage a permissively-licensed engine so
  the user never installs anything separately. Candidates: **Colima** (Apache-2.0, Lima VM) or a
  **Podman machine**. The launcher provisions the VM, sets `DOCKER_HOST`, and treats it as an
  implementation detail. This is the part that makes it feel like "just an app," and the part to scope
  carefully (VM lifecycle, disk, Apple-Silicon/Intel, resource sizing for the ML worker).

  > **Decision needed:** how far to push Phase 2, and Colima vs Podman. Recommend Colima first
  > (closest to the Docker CLI the compose flow already assumes). Flagged as an open decision below.

Either way the launcher invokes the **unchanged `docker-compose.release.yml`** — the engine is swappable
under it.

### First-run setup wizard (replaces the hand-edited `.env`)

A few friendly screens that produce the `.env` the release compose expects (variables per
`.env.example`):

1. **Generate secrets automatically** — `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` (+ matching
   `S3_SECRET_KEY`), `LQ_AI_GATEWAY_KEY`, `JWT_SECRET` are strong random values minted by the launcher.
   The user never sees or types these. Stored in the OS keychain; written to a `chmod 600` `.env` in the
   app data dir at stack-start time.
2. **Ports** — default to the shifted set (`DONNA_WEB_HOST_PORT=13002`, etc.); auto-detect collisions and
   bump if a port is busy. `ORIGIN` is kept in lockstep with the chosen web port (the adapter-node
   origin check 403s otherwise — CLAUDE.md §10).
3. **Inference choice** — radio: *(a)* paste an `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` for cloud inference,
   or *(b)* fully local via Ollama (`OLLAMA_BASE_URL` → `http://host.docker.internal:11434`), the
   lowest-barrier / access-to-justice path. BYOK keys can also be set later in-app (Settings already
   supports provider keys); the wizard just seeds the gateway env for the simplest first run.
4. **Create your login** — collect an admin email + password, then run the first-run fixture *for* the
   user once `api` is healthy:
   `docker compose … exec -T api python -m app.cli reset-admin-password --email <e> --password <p> --no-force-change`.
   The user never sees this command.

Re-running the app reuses the stored config; the wizard only appears when no config/keychain entry
exists (or the user picks "reset").

### The window + lifecycle controls

- A **control-panel view** (native, served by the launcher itself) shows stack state, a Start/Stop
  toggle, "Open Donna", a logs pane (tailing `docker compose logs`), and an "Update" action.
- **Open Donna** navigates the main webview to `http://localhost:13002` once healthy. Because it's the
  same BFF over localhost, cookies are `http`-only-localhost (no TLS needed locally — the `Secure`-cookie
  TLS caveat in CLAUDE.md §10 applies only to non-localhost deploys, which this is not).
- **Quit** offers "stop the stack" vs "leave it running in the background"; a menu-bar item reflects state.

### Updates (two independent axes)

- **Donna/backend version** = the image tag. The launcher writes `DONNA_IMAGE_TAG` (defaulting to a
  pinned release, not `latest`, so updates are deliberate), and "Update" pulls the new tag and recreates
  the stack. It surfaces the available release from GHCR.
- **Launcher app version** = standard desktop auto-update (`tauri-plugin-updater` against a release feed).
  Kept separate so a launcher bug-fix doesn't force a backend re-pull and vice-versa.

### Packaging, signing, notarization (macOS)

- Distributed as a **Developer ID-signed, notarized `.app`/`.dmg` outside the App Store** — *not*
  sandboxed. App Store sandboxing forbids managing a container engine, spawning daemons, and the local
  port/process control this app is built on; the launcher category (cf. Docker Desktop, OrbStack,
  TablePlus) is notarized-but-unsandboxed. Notarization (hardened runtime + stapled ticket) is required
  for Gatekeeper to let users open it without scary warnings — that's the "installation wizard"
  experience the ask wants.
- Ships in a new top-level dir, **outside** the SvelteKit app and **outside** `vendor/`, with its own CI;
  it builds nothing from the submodule.

## Phasing (build order)

1. **Phase 0 — spec sign-off + tech choice** (Tauri vs Electron; Colima vs Podman scope). This doc + the
   open decisions below.
2. **Phase 1 — detect-Docker launcher (MVP).** Lifecycle state machine, first-run wizard (secret gen +
   admin fixture + inference choice), control panel, webview, logs. Requires the user to have Docker.
   Signed + notarized `.dmg`. **This already delivers "no terminal, no GitHub, no `.env`."**
3. **Phase 2 — managed engine.** Bundle/manage Colima (or Podman) so Docker is no longer a prerequisite —
   the true double-click experience.
4. **Phase 3 — polish.** Auto-update, update-available surfacing from GHCR, resource/disk controls for
   the ML worker, menu-bar UX.

Each phase is independently shippable; Phase 1 is the value inflection point.

## Verification

- **Phase 1, real run:** on a clean Mac with Docker present and **no repo cloned**, the `.dmg` installs,
  the wizard generates secrets, the stack comes up (including the first-run model download shown
  honestly), the admin login created by the fixture works, and the window reaches the authed app — the
  "fresh clone" rigor, but from an installer. Evidence = a recorded run, not an assertion.
- **State-machine tests:** unit-test the engine/stack-state derivation against captured
  `docker compose ps`/`docker info` outputs (healthy, starting, one-service-down, engine-absent).
- **Lifecycle teardown:** Stop genuinely stops the stack; Quit options behave; re-launch reuses stored
  config without re-running the wizard.
- **Signing/notarization:** `spctl --assess` / `codesign --verify` pass on the produced `.app`; Gatekeeper
  opens it without override on a machine that never saw it.
- **Phase 2:** the same fresh-Mac run with **no Docker installed** — the launcher provisions the managed
  engine and reaches HEALTHY unaided.

## Out of scope

- **Windows / Linux desktop builds.** The architecture is portable (engine + compose are cross-platform),
  but v1 targets macOS only. A Windows build is a follow-up (WSL2 as the engine backend) — note it in the
  roadmap, don't build it here.
- **App Store distribution** (sandbox incompatible — see packaging).
- **A self-contained, Docker-free native backend** (the Tier-2/Tier-3 path; rejected — would fork the
  vendored runtime).
- **Any change to `donna-web`, the BFF, or backend behavior.** If the launcher needs something the app
  doesn't expose, that's a normal Donna feature or an upstream request, not launcher-special code.
- **Multi-user / server deployment.** This is a single-user, on-device launcher; multi-user stays the
  compose/TLS deployment path.

## File structure (new/changed)

- Create: `desktop/` — the Tauri (or Electron) launcher project (its own `package.json`/`Cargo.toml`,
  its own CI). Self-contained; references the release compose by URL/version, builds nothing from
  `vendor/`.
- Create: `.github/workflows/desktop-release.yml` — build, sign, notarize, and publish the `.dmg` +
  update feed (runs on macOS runners; signing identities/notary creds as repo secrets).
- Modify: `docs/roadmap/donna-future-roadmap.md` (Distribution section — add the launcher entry),
  `README.md` (a "Desktop app (macOS)" install option above the compose flow), `CLAUDE.md` (a short note
  that `desktop/` exists, wraps the release compose, and never forks the web/backend).
- Possibly: a tiny `docs/decisions/` note recording the Tauri-vs-Electron + engine choice.

## Open decisions (confirm before Phase 1)

1. **Tauri vs Electron** for the shell. Recommend Tauri (footprint + the work is orchestration, not
   webview perf).
2. **How far to take Phase 2**, and **Colima vs Podman** for the managed engine. Recommend Colima first;
   Phase 1 ships value without resolving this.
3. **Default `DONNA_IMAGE_TAG`** — pin to the latest release (deliberate updates) vs track `latest`.
   Recommend pinning.
4. **Cloud-key vs local-first default** in the wizard's inference step — which to pre-select for the
   non-technical/access-to-justice audience. Recommend defaulting to the API-key path with local Ollama
   one click away, but this is a product call.

## Decisions resolved (2026-06-13)

The four open decisions were settled with the project owner before planning Phase 1:

1. **Shell: Electron** (overriding the doc's Tauri recommendation). Rationale: keep the launcher in the
   same JS/TS ecosystem as `donna-web` so the team maintains one toolchain; the footprint cost is
   accepted. The design below is engine-agnostic, so this only changes the shell project scaffolding,
   the auto-updater plug-in (`electron-updater` instead of `tauri-plugin-updater`), and packaging
   (`electron-builder` for sign/notarize). The lifecycle state machine, wizard, env-generation, and
   compose orchestration are unchanged. Secrets use Electron's built-in `safeStorage` (Keychain-backed)
   rather than a third-party keychain binding.
2. **Engine scope: Phase 1 only** — detect Docker and guide the user to install it if absent. Bundled
   Colima/Podman (Phase 2) is deferred to a later milestone.
3. **`DONNA_IMAGE_TAG`: pinned** to a release (default `v0.1.0`), not `latest`. Updates are deliberate.
4. **Inference default: cloud API key**, with local Ollama one radio-click away.

The concrete, task-by-task Phase 1 plan derived from these decisions lives at
[`2026-06-13-desktop-launcher-phase1.md`](2026-06-13-desktop-launcher-phase1.md).
