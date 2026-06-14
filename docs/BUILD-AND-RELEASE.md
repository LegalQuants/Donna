# Building & releasing Donna — container images + the macOS app

This is the operator's guide for shipping Donna: the **pre-built container images** and the
**"Donna for Mac" desktop launcher**. It's written for whoever cuts the next release (e.g. v0.2.0),
and it deliberately records the **dead-ends and fixes** we hit the first time so you don't re-discover
them.

> Signing is described **generically** here (you supply your own Apple Developer ID). The exact
> commands we ran are reusable as-is; just substitute your own certificate, Apple ID, and team.

**TL;DR of the two pipelines**

| What | Workflow | Trigger | Output |
|---|---|---|---|
| Container images | `.github/workflows/release.yml` | `gh workflow run release.yml -f ref=main -f tag=vX.Y.Z` (or push a `v*` tag) | 5 multi-arch images → `ghcr.io/<namespace>/donna-*` |
| macOS app | `.github/workflows/desktop-release.yml` | `gh workflow run desktop-release.yml -f tag=desktop-vX.Y.Z` (or push a `desktop-v*` tag) | signed+notarized `.dmg` on a GitHub Release |

---

## 0. Architecture in one screen

- **`donna-web`** is a normal `adapter-node` SvelteKit server — built straight from the repo `Dockerfile`.
- The legal-AI backend lives in the pinned **`vendor/lq-ai`** submodule, which we must **never edit**.
  So we publish two **wrapper images** that add Donna's bits *on top of* the upstream images without
  touching the submodule: **`donna-api`** (= lq-ai `api` + baked `vendor/lq-ai/skills`) and
  **`donna-gateway`** (= lq-ai `gateway` + baked `gateway.yaml.example`). The wrappers `FROM` two
  base images we also publish (`donna-api-base`, `donna-gateway-base`) = the raw lq-ai images.
  *(When LQ-AI publishes its own images, this wrapper layer goes away — see `docs/upstream-requests/lq-ai-publish-container-images.md`.)*
- **`docker-compose.release.yml`** is the image-only install stack — a **hand-maintained mirror** of
  the dev compose's wiring. Re-sync it on every pin bump.
- **The macOS launcher** (`desktop/`) is a thin **Electron** app that shells out to that release
  compose. It has a **pure, unit-tested core** (`desktop/src/core/`, zero Electron imports) and a
  **thin Electron glue** layer (`main`/`preload`/`renderer`). It reimplements no backend/web logic.

---

## Part 1 — Container images (`release.yml`)

### What it builds
In order: `donna-api-base` and `donna-gateway-base` (raw lq-ai, from `vendor/lq-ai/api` and
`vendor/lq-ai/gateway`), then the wrappers `donna-api` / `donna-gateway` (build-arg `BASE=` points at
the just-built base), then `donna-web`. All `linux/amd64,linux/arm64`. The wrapper Dockerfiles
(`docker/api.Dockerfile`, `docker/gateway.Dockerfile`) take `ARG BASE` so they don't hardcode a
namespace.

### Namespace is configurable
`release.yml` has a `namespace` `workflow_dispatch` input (default `legalquants`); the compose reads
`ghcr.io/${DONNA_IMAGE_NAMESPACE:-legalquants}/donna-*`. To publish under a namespace you own, run the
workflow **from a fork/mirror in that org** (so `GITHUB_TOKEN` has `packages:write` there) with
`namespace=<your-org>`, and set `DONNA_IMAGE_NAMESPACE` in the installer `.env`.

### Cut an image release
```bash
gh workflow run release.yml -R <org>/Donna -f ref=main -f tag=v0.2.0
gh run watch <run-id> -R <org>/Donna --exit-status      # NB: see the watch-lies gotcha below
```

> ⚠️ **Build from a ref that actually contains `docker/` + `release.yml`.** The `v0.1.0` *source
> tag* predates the pre-built-images feature, so building from `ref: v0.1.0` fails (no Dockerfiles).
> Build from **`main`** (or a tag that includes the docker infra) and pass `tag:` for the image tag.
> The app code in `main` vs the tag was identical, so `ref=main, tag=v0.1.0` produced correct images.

### Make the packages public (one-time, easy to miss)
Actions publishes packages **private**. Two layers:
1. **Org policy.** If "Change visibility → Public" is **greyed out** ("disabled by organization
   administrators"), an **org owner** must enable public packages at
   `github.com/organizations/<org>/settings/packages` → *Package creation* → allow **Public**. A plain
   member can't do this. (We hit this — only org owners could flip it.)
2. **Per-package.** Then for each of the 5 packages (`donna-web`, `donna-api`, `donna-gateway`,
   `donna-api-base`, `donna-gateway-base`): org → Packages → package → *Package settings* → *Change
   visibility* → **Public**. (There is **no reliable REST API** for this — it's a UI action.)

### Verify they're anonymously pullable
```bash
for img in donna-web donna-api donna-gateway donna-api-base donna-gateway-base; do
  TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:<org>/$img:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "https://ghcr.io/v2/<org>/$img/manifests/v0.2.0")
  echo "$img -> $code"   # 200 = public
done
```

### On a pin bump, re-sync the release compose
`docker-compose.release.yml` is a hand-maintained mirror of `vendor/lq-ai/docker-compose.yml` + the
`donna-web` service. After `cd vendor/lq-ai && git checkout <sha>`, diff the upstream compose and
re-apply any service/env changes to `docker-compose.release.yml`. Record the bump in
`docs/decisions/lq-ai-pin.md`.

---

## Part 2 — The macOS app (`desktop/`)

### Layout (keep this split)
```
desktop/
  src/core/      PURE, unit-tested (vitest), NO electron import:
                 secrets · env (renderEnv) · ports · compose (argv + ps parse) ·
                 engine (probe parse) · state (deriveLauncherState) · dockerPath · config
  src/main/      Electron main: index (lifecycle+IPC) · runner (spawn) · store (safeStorage + .env) ·
                 orchestrator (snapshot/start/stop/reset/admin) · paths · netcheck
  src/preload/   contextBridge IPC surface (window.donna)
  src/renderer/  vanilla-TS wizard + control panel
  electron.vite.config.ts · electron-builder.yml · build/ (entitlements) · resources/ (compose copied in)
```
Rule of thumb: **all decidable logic goes in `core/` with a test**; `main/`/`renderer/` are thin I/O
+ DOM and are verified by `tsc` + `npm run build` + the real run (they need an Electron runtime).

Gates: `cd desktop && npx vitest run` (45 tests) · `npx tsc --noEmit` · `npm run build` (3 bundles).
Local unsigned smoke build: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist` → an unsigned `.dmg`.

### Cut a desktop release
```bash
gh workflow run desktop-release.yml -R <org>/Donna -f tag=desktop-v0.2.0
```
The workflow runs on `macos-14`, runs the core tests + typecheck, then `npm run dist` (sign + notarize)
and publishes the `.dmg` to a `desktop-v0.2.0` Release. Needs the signing secrets from Part 3.

---

## Part 3 — Code signing & notarization (the hard-won recipe)

This is the part that took the most iterations. Read it before you touch `electron-builder.yml`.

### One-time: get a Developer ID + the 5 secrets
1. **Developer ID Application certificate** (the only type that works for distributing a `.app`/`.dmg`
   outside the App Store — *not* "Apple Development", *not* "Developer ID Installer"). Easiest via
   **Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application**. Verify +
   read your Team ID:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   #  …  "Developer ID Application: <Your Org> (TEAMID1234)"   ← the 10-char code is APPLE_TEAM_ID
   ```
2. **Export the cert + private key** as a `.p12` (Keychain Access → My Certificates → right-click the
   cert that has a ▸ private key → Export → `.p12`, set an export password). Base64 it:
   ```bash
   base64 -i cert.p12 -o cert.b64
   ```
3. **App-specific password** for notarytool: account.apple.com → Sign-In and Security → App-Specific
   Passwords → generate (`abcd-efgh-ijkl-mnop`). (Requires 2FA on the Apple ID.)
4. **Set the 5 GitHub Actions secrets** on the repo (`gh secret set NAME --body "$(pbpaste)"` keeps
   secrets out of shell history; the cert reads from the file):
   - `MAC_CSC_LINK` ← `gh secret set MAC_CSC_LINK -R <org>/Donna < cert.b64`
   - `MAC_CSC_KEY_PASSWORD` (the .p12 export password)
   - `APPLE_ID` (the Apple ID email on the dev team)
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`

   `desktop-release.yml` maps `MAC_CSC_LINK`→`CSC_LINK`, `MAC_CSC_KEY_PASSWORD`→`CSC_KEY_PASSWORD`
   (electron-builder signs with these) and passes the three `APPLE_*` through for notarization.
   Then **delete the local key material** (`rm cert.p12 cert.b64`).

### The notarization recipe — what actually works (and the 3 traps)
electron-builder (24.13) does **not** make a Gatekeeper-passing DMG out of the box. The working config
(`desktop/electron-builder.yml`) is:
```yaml
mac:
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: <TEAMID>        # TRAP 1
afterAllArtifactBuild: build/notarize-dmg.cjs   # TRAP 2
dmg:
  sign: true               # TRAP 2
```
- **Trap 1 — `notarize: true` fails with "teamId property is required."** electron-builder does *not*
  read `APPLE_TEAM_ID` from the env for native notarization; `teamId` **must** be in the config.
- **Trap 2 — native notarize only signs+notarizes the `.app`,** then builds a **bare `.dmg`** that is
  neither signed nor stapled → the *downloaded* dmg fails Gatekeeper ("Apple cannot check it for
  malicious software"). Fix: `dmg.sign: true` (sign the dmg) **plus** an `afterAllArtifactBuild` hook
  (`build/notarize-dmg.cjs`) that runs `xcrun notarytool submit <dmg> --apple-id … --team-id … --wait`
  then `xcrun stapler staple <dmg>`. A *stapled but unsigned* dmg still fails ("no usable signature") —
  it needs **both** signing and notarization+stapling.
- **Trap 3 — the `.app` preload must be `.mjs`.** electron-vite emits the preload as
  `out/preload/index.mjs` (the package is `"type": "module"`); the main process must reference
  `../preload/index.mjs` or `window.donna` is `undefined` at runtime. `sandbox: false` is kept because
  a sandboxed preload can't be ESM; `contextIsolation` (on by default) is the real security boundary.

### Verify the *published* artifact (not the CI exit code)
```bash
gh release download desktop-v0.2.0 -R <org>/Donna -p '*.dmg' -D /tmp --clobber
spctl -a -vvv -t open --context context:primary-signature /tmp/Donna-*.dmg
#   want:  accepted / source=Notarized Developer ID / origin=Developer ID Application: <Org> (TEAMID)
xcrun stapler validate /tmp/Donna-*.dmg     # "The validate action worked!"
```

---

## Part 4 — Real-run gotchas (the dead-ends; don't re-discover these)

These only surfaced on the **first real Finder launch of the signed app** — the automated/CI tests
couldn't catch them (CI runs `docker` from a full-PATH shell). All are fixed in `desktop/`; this is why
they're there.

1. **`spawn docker ENOENT` even with Docker installed.** A Finder-launched macOS app inherits a
   minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) without `/usr/local/bin` (where Docker Desktop's CLI
   lives). Fix: `core/dockerPath.ts` `dockerSearchPath()` prepends `/usr/local/bin`,`/opt/homebrew/bin`,
   `/Applications/Docker.app/Contents/Resources/bin`; the runner spawns with that PATH. Also: **every**
   `spawn` needs an `error` handler — a missing one on the log-tail (`streamDocker`) crashed the whole
   main process with an uncaught exception.
2. **Compose project isolation.** The launcher must use its **own** project name (`donna-desktop`),
   **not** `donna` — which collides with the build-from-source / raw-lq-ai dev stacks and **reuses
   their `donna_pgdata` volume**. Postgres only applies `POSTGRES_PASSWORD` on first init of an *empty*
   volume, so a reused volume keeps the *old* password → `api` "password authentication failed"
   crash-loop. (`-p` overrides the compose file's top-level `name:`.)
3. **Don't strand config on failure.** Persist the config blob **only after** the stack is healthy AND
   the admin is created. (We first saved it before starting the stack, so a failed run skipped the
   wizard on next launch.) The `.env` must still be written *before* `up` (the stack needs it).
4. **Backend admin model.** The lq-ai api auto-bootstraps a **fixed** admin **`admin@lq.ai`** on first
   run; the only CLI is `reset-admin-password` (resets an existing user — **no create-user**). So the
   wizard must **set a password for `admin@lq.ai`** (not invent a custom email), and `completeWizard`
   **must check the fixture's exit code** (we first ignored it → "Running" with no usable login). Users
   change their email later in Settings.
5. **A "Reset" must run `down -v`.** Deleting the app config alone leaves the volumes — whose old
   Postgres password collides with the next wizard's freshly-generated secrets. The Reset action does
   `down -v` + clears config.
6. **`gh run watch --exit-status` can report exit 0 on a *failed* run.** Always confirm with
   `gh run view <id> --json conclusion` AND verify the actual artifact (`spctl`). This bit us once (a
   build failed on the teamId trap but the watch said success).
7. **First-run "downloading models" ≠ chat LLMs.** Those are the ingest-worker's document-processing
   models (HF embeddings + Docling + EasyOCR) downloaded to its cache volumes. The stack reaches
   HEALTHY (and login works) before they finish — the ingest-worker healthcheck only pings redis. Show
   **live `N/8 services ready`**, not a static "downloading models" message.

App data lives at `~/Library/Application Support/donna-desktop/` (`config.enc` + chmod-600 `.env`).

---

## Part 5 — Verifying a release

1. **Automated isolated boot test** (proves the *published images* stand up to a login, no GUI) — use
   a **distinct `-p` project + shifted ports** so it can't touch any dev stack, pull `vX.Y.Z`, wait for
   all 8 healthy, run the admin fixture, then `POST /login?/login` with an `Origin` header and confirm
   the `donna_at`/`donna_rt` session cookies come back. Tear down with `down -v`. (See the steps
   captured in `desktop/VERIFICATION.md`.)
2. **Real-Mac run** of the signed `.dmg` (the only way to catch Part 4 bugs): clean machine (or wipe
   `donna-desktop` containers+volumes+app-config first), install → wizard → HEALTHY → login →
   Stop/relaunch/engine-absent. Record it. This is `desktop/VERIFICATION.md`.

---

## Quick reference

```bash
# images
gh workflow run release.yml -R <org>/Donna -f ref=main -f tag=v0.2.0
# … then flip the 5 GHCR packages public (org policy + per-package), verify anon pull.

# macOS app (needs the 5 signing secrets)
gh workflow run desktop-release.yml -R <org>/Donna -f tag=desktop-v0.2.0
gh run view <id> -R <org>/Donna --json conclusion     # trust this, not `watch`
gh release download desktop-v0.2.0 -R <org>/Donna -p '*.dmg' -D /tmp --clobber
spctl -a -t open --context context:primary-signature /tmp/Donna-*.dmg   # accepted/Notarized

# manual admin reset on a running launcher stack
docker compose -f "/Applications/Donna.app/Contents/Resources/docker-compose.release.yml" \
  -p donna-desktop --env-file "$HOME/Library/Application Support/donna-desktop/.env" \
  exec -T api python -m app.cli reset-admin-password --email admin@lq.ai --password 'New123456789!' --no-force-change
```

See also: `docs/INSTALL-MAC.md` (end-user guide), `desktop/VERIFICATION.md` (live evidence),
`docs/roadmap/donna-future-roadmap.md` (Phase 2/3 + Windows), and the design/plan under
`docs/superpowers/plans/2026-06-13-desktop-launcher-phase1.md`.
