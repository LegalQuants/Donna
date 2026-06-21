# Slice F — Zero-config research wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CourtListener research turnkey on the shipped paths — a user provides only a
`COURTLISTENER_API_TOKEN` and research works, no `gateway.yaml` editing — and plumb (but don't
default) MCP.

**Architecture:** The `donna-gateway` wrapper image bakes a Donna-owned `tool_providers: courtlistener`
block (gated on the token; gateway skips it cleanly when unset) onto the seeded gateway config. The
compose files pass the token + MCP env vars through to the gateway; `.env.example` documents them; the
desktop wizard adds an optional token field and bumps the image tag.

**Tech Stack:** Docker/Compose, BuildKit heredoc, TypeScript (desktop core), Vitest, YAML.

## Global Constraints

- **Never edit `vendor/lq-ai`.** Donna owns only the ~12-line CL snippet, baked into Donna's wrapper image.
- **`anonymize_outbound: false`** for the shipped CourtListener provider.
- No default MCP servers; MCP = env plumbing + docs only.
- No token ⇒ gateway starts clean, research off (never a crash). Empty-default env vars (`${VAR:-}`).
- `npm run lint` clean (covers `.env.example`, compose, docs, Dockerfile via prettier where applicable);
  desktop tests pass under the desktop vitest config. End commits with the
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Prettier may flag touched `.md`; `npx prettier --write <file>` and re-check.

---

## File Structure

- Modify `docker/gateway.Dockerfile` — append the CL `tool_providers` snippet to the baked example.
- Modify `docker-compose.release.yml` + `desktop/resources/docker-compose.release.yml` (mirror) +
  `docker-compose.yml` (dev) — pass `COURTLISTENER_API_TOKEN` + MCP env vars to the gateway.
- Modify `.env.example` — uncomment/document the CL token; add a documented MCP block.
- Modify `desktop/src/core/config.ts` — `courtlistenerToken?` on `LauncherConfig`.
- Modify `desktop/src/core/env.ts` — render `COURTLISTENER_API_TOKEN`.
- Modify `desktop/src/core/env.test.ts` — assert the new line.
- Modify `desktop/src/renderer/wizard.ts` — optional token field → `WizardInput`.
- Modify `desktop/src/main/index.ts` — thread `courtlistenerToken`; bump `imageTag` → `v0.2.0`.
- Create `docs/decisions/release-courtlistener-wiring.md`; modify `README.md` (one note).

---

## Task 1: Bake the CourtListener provider into the gateway wrapper

**Files:** Modify `docker/gateway.Dockerfile`; Test `docker/gateway-config.test.sh` (new, a YAML-validity check).

- [ ] **Step 1: Write the failing check** — `docker/gateway-config.test.sh`:

```bash
#!/usr/bin/env bash
# Verifies the vendored gateway example + Donna's appended CourtListener snippet is valid
# YAML with an active `tool_providers: courtlistener` (api_key_env COURTLISTENER_API_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP="$ROOT/docker/courtlistener.tool_provider.yaml"
EX="$ROOT/vendor/lq-ai/gateway.yaml.example"
python3 - "$EX" "$SNIP" <<'PY'
import sys, yaml
ex, snip = open(sys.argv[1]).read(), open(sys.argv[2]).read()
cfg = yaml.safe_load(ex + "\n" + snip)
tps = cfg.get("tool_providers") or []
assert any(p.get("name") == "courtlistener" and p.get("api_key_env") == "COURTLISTENER_API_TOKEN"
           and p.get("anonymize_outbound") is False for p in tps), f"bad tool_providers: {tps}"
print("OK: courtlistener tool_provider present and valid")
PY
```

- [ ] **Step 2: Run it — fails** (`docker/courtlistener.tool_provider.yaml` missing):
      `bash docker/gateway-config.test.sh` → Expected: error (no such file).

- [ ] **Step 3: Create the snippet** `docker/courtlistener.tool_provider.yaml`:

```yaml
# Donna packaging: CourtListener case-law research, active only when
# COURTLISTENER_API_TOKEN is set (the gateway skips it with a warning otherwise).
tool_providers:
  - name: courtlistener
    type: courtlistener
    base_url: https://www.courtlistener.com/api/rest/v4
    api_key_env: COURTLISTENER_API_TOKEN
    egress_tier: 4
    allowlist:
      hosts: [www.courtlistener.com]
    rate_limit:
      requests_per_minute: 60
    anonymize_outbound: false
```

- [ ] **Step 4: Update `docker/gateway.Dockerfile`** — append the snippet onto the baked example. The
      build context is `vendor/lq-ai/`, so COPY the snippet in via an absolute repo path is NOT possible;
      instead embed the append inline with a BuildKit heredoc (no extra context file needed):

Replace the final `COPY` line's tail so the file reads:

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
# Donna packaging: enable the CourtListener case-law tool-provider, gated on
# COURTLISTENER_API_TOKEN. The gateway skips it (with a warning) when the token is
# unset, so research stays OFF until a user brings a key. We never edit the vendored
# submodule — we append our own ~12-line block to our own wrapper image. This block
# MUST stay in sync with docker/courtlistener.tool_provider.yaml (the test source of truth).
RUN cat >> /usr/share/lq-ai/gateway.yaml.example <<'YAML'

# --- Donna: CourtListener case-law research (active when COURTLISTENER_API_TOKEN is set) ---
tool_providers:
  - name: courtlistener
    type: courtlistener
    base_url: https://www.courtlistener.com/api/rest/v4
    api_key_env: COURTLISTENER_API_TOKEN
    egress_tier: 4
    allowlist:
      hosts: [www.courtlistener.com]
    rate_limit:
      requests_per_minute: 60
    anonymize_outbound: false
YAML
```

(The standalone `docker/courtlistener.tool_provider.yaml` is the test's source of truth and
human-readable reference; the Dockerfile heredoc is the same block — keep them identical.)

- [ ] **Step 5: Run the check — passes:** `bash docker/gateway-config.test.sh` → "OK: courtlistener…".
- [ ] **Step 6: Commit:**

```bash
chmod +x docker/gateway-config.test.sh
git add docker/gateway.Dockerfile docker/courtlistener.tool_provider.yaml docker/gateway-config.test.sh
git commit -m "feat(release): bake CourtListener tool-provider into the donna-gateway wrapper (Slice F)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pass the token + MCP env vars through the compose files + `.env.example`

**Files:** Modify `docker-compose.release.yml`, `desktop/resources/docker-compose.release.yml`,
`docker-compose.yml`, `.env.example`.

**Context:** The release `gateway` service `environment:` block lists provider keys (ANTHROPIC_API_KEY,
…, LQ_AI_DEV_MODE). Add the four new vars to that block in all three compose files (the desktop copy is
an exact mirror — keep them identical). For the **api** service, also add `LQ_AI_MCP_MASTER_KEY` +
`LQ_AI_CORS_ORIGINS` (the api uses them for the MCP-OAuth/Connections surface — verify the api service
block in each compose and add there too).

- [ ] **Step 1: Add to each `gateway` service `environment:`** (release, desktop mirror, dev):

```yaml
COURTLISTENER_API_TOKEN: ${COURTLISTENER_API_TOKEN:-}
MCP_CONFIG_PATH: ${MCP_CONFIG_PATH:-}
LQ_AI_MCP_MASTER_KEY: ${LQ_AI_MCP_MASTER_KEY:-}
LQ_AI_CORS_ORIGINS: ${LQ_AI_CORS_ORIGINS:-}
```

- [ ] **Step 2: Add to each `api` service `environment:`** (release, desktop mirror, dev):

```yaml
LQ_AI_MCP_MASTER_KEY: ${LQ_AI_MCP_MASTER_KEY:-}
LQ_AI_CORS_ORIGINS: ${LQ_AI_CORS_ORIGINS:-}
```

- [ ] **Step 3: Verify release + desktop copies are identical:**
      `diff docker-compose.release.yml desktop/resources/docker-compose.release.yml` → Expected: no diff.

- [ ] **Step 4: Update `.env.example`** — replace the CL block (lines ~43–47) with the token enabled
      directly (drop the "AND enable the gateway block" caveat, which is no longer true for release/desktop),
      and add a documented MCP block after it:

```bash
# Optional legal-research key (case-law research). User-provided — get your own free token at
# https://www.courtlistener.com/help/api/. Setting this turns case-law research ON (the release
# images + desktop app ship the gateway's courtlistener tool-provider pre-enabled; it stays off
# until a token is present). NEVER commit a real token (.env is gitignored).
#   COURTLISTENER_API_TOKEN=

# Optional MCP (Model Context Protocol) tool servers — ADVANCED / operator opt-in. No servers ship
# by default. To enable: mount an mcp.yaml into the gateway and point MCP_CONFIG_PATH at it; set
# LQ_AI_MCP_MASTER_KEY (Fernet key, for OAuth-server tokens at rest) and LQ_AI_CORS_ORIGINS to your
# Donna origin (e.g. http://localhost:13002) for the per-user Connections flow.
#   MCP_CONFIG_PATH=   LQ_AI_MCP_MASTER_KEY=   LQ_AI_CORS_ORIGINS=
```

- [ ] **Step 5: Validate compose syntax + lint:**
      `docker compose -f docker-compose.release.yml config -q` (Expected: no error),
      `npm run lint` (Expected: clean). Commit:

```bash
git add docker-compose.release.yml desktop/resources/docker-compose.release.yml docker-compose.yml .env.example
git commit -m "feat(release): pass COURTLISTENER_API_TOKEN + MCP env vars to the gateway/api (Slice F)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Desktop wizard — optional CourtListener token + imageTag bump

**Files:** Modify `desktop/src/core/config.ts`, `desktop/src/core/env.ts`, `desktop/src/core/env.test.ts`,
`desktop/src/renderer/wizard.ts`, `desktop/src/main/index.ts`.

**Context:** Desktop core has its own vitest. `renderEnv(cfg)` builds the `.env`; the wizard collects
input → IPC `wizard:complete` → builds `LauncherConfig` → `writeEnvFile`. `imageTag` is hardcoded
`'v0.1.0'` in `desktop/src/main/index.ts`.

- [ ] **Step 1: Failing test** — add to `desktop/src/core/env.test.ts`:

```ts
it('emits COURTLISTENER_API_TOKEN (empty when absent, the value when set)', () => {
	expect(parseEnv(renderEnv(base)).COURTLISTENER_API_TOKEN).toBe('');
	const withTok = parseEnv(renderEnv({ ...base, courtlistenerToken: 'cl-tok-123' }));
	expect(withTok.COURTLISTENER_API_TOKEN).toBe('cl-tok-123');
});
```

- [ ] **Step 2: Run it — fails** (TS: `courtlistenerToken` not on `LauncherConfig`; line absent):
      `cd desktop && npx vitest run src/core/env.test.ts` → FAIL.

- [ ] **Step 3: Add the field** to `desktop/src/core/config.ts` `LauncherConfig`:

```ts
	inference: InferenceChoice;
	adminEmail: string;
	/** Optional CourtListener API token (enables case-law research); blank/absent ⇒ research off. */
	courtlistenerToken?: string;
```

- [ ] **Step 4: Render it** in `desktop/src/core/env.ts` `renderEnv` — in the `# Inference` group,
      after the `OLLAMA_BASE_URL` line, add a research line:

```ts
(`OLLAMA_BASE_URL=${ollama}`,
	'',
	'# Legal research (optional — case-law via CourtListener)',
	`COURTLISTENER_API_TOKEN=${cfg.courtlistenerToken ?? ''}`,
	'');
```

- [ ] **Step 5: Run it — passes:** `cd desktop && npx vitest run src/core/env.test.ts` → PASS.

- [ ] **Step 6: Wizard field** — in `desktop/src/renderer/wizard.ts`, add an optional input near the
      API-key field (its own row), and collect it into the `completeWizard` payload:

```html
<input
	id="cltoken"
	type="password"
	placeholder="CourtListener token (optional — enables case-law research)"
/>
```

In the submit handler, read it and pass it:

```ts
const courtlistenerToken = $<HTMLInputElement>('cltoken').value.trim();
const res = await window.donna.completeWizard({
	inference,
	adminEmail: ADMIN_EMAIL,
	adminPassword: password,
	courtlistenerToken
});
```

- [ ] **Step 7: Thread it + bump the tag** in `desktop/src/main/index.ts` — extend `WizardInput` with
      `courtlistenerToken?: string`, pass it into the `LauncherConfig`, and bump the tag:

```ts
const cfg: LauncherConfig = {
	secrets: generateSecrets(),
	ports: resolvePorts(DEFAULT_PORTS, isPortFreeSync),
	imageTag: 'v0.2.0',
	inference: input.inference,
	adminEmail: input.adminEmail,
	courtlistenerToken: input.courtlistenerToken
};
```

(If a `WizardInput` interface is declared in this file, add `courtlistenerToken?: string;` to it.)

- [ ] **Step 8: Verify + commit:**
      `cd desktop && npx vitest run && npm run typecheck` (or the desktop's check script) → green.

```bash
git add desktop/src/core/config.ts desktop/src/core/env.ts desktop/src/core/env.test.ts desktop/src/renderer/wizard.ts desktop/src/main/index.ts
git commit -m "feat(desktop): optional CourtListener token in the wizard; pin images v0.2.0 (Slice F)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Docs — decision note + README

**Files:** Create `docs/decisions/release-courtlistener-wiring.md`; modify `README.md`.

- [ ] **Step 1: Decision note** `docs/decisions/release-courtlistener-wiring.md`:

```markdown
# Decision: release-side CourtListener wiring

The `donna-gateway` wrapper image (`docker/gateway.Dockerfile`) appends a Donna-owned
`tool_providers: courtlistener` block (mirror of `docker/courtlistener.tool_provider.yaml`) onto the
baked `gateway.yaml.example`, gated on `COURTLISTENER_API_TOKEN`. The gateway skips an un-keyed
provider at startup (with a warning) and still serves, so a user enables case-law research by setting
the token alone — no `gateway.yaml` edit. `anonymize_outbound: false`: CourtListener queries are
public case-law lookups (case names / legal terms); anonymizing them would rewrite entities and wreck
search results.

**Drift caveat:** the snippet must stay valid against upstream's `vendor/lq-ai/gateway.yaml.example`
on every pin bump; `docker/gateway-config.test.sh` verifies the concatenation parses with an active
`courtlistener` provider. MCP stays operator opt-in (env vars plumbed, no default servers). Dev still
seeds the commented-out vendored example — a developer appends the block once (handoff recipe) or sets
the token after enabling it; turnkey behavior is verified on the release-image path.
```

- [ ] **Step 2: README note** — in the "Quick install … Option B" area, add one line that adding
      `COURTLISTENER_API_TOKEN` to `.env` turns on case-law research (and the desktop wizard has an optional
      field for it). Keep it to 1–2 sentences in the existing style.

- [ ] **Step 3: Lint + commit:**

```bash
npx prettier --write docs/decisions/release-courtlistener-wiring.md README.md && npm run lint
git add docs/decisions/release-courtlistener-wiring.md README.md
git commit -m "docs(release): record CourtListener release wiring + README install note (Slice F)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Live turnkey verification (controller, on the release-image dry-run)

Not a code commit — performed when we build the 0.2.0 release images (the dry-run step 2). Verifies:

- [ ] Build the `donna-gateway` wrapper; assert the baked config has an active `courtlistener` block:
      `docker run --rm --entrypoint sh <donna-gateway-image> -c 'tail -20 /usr/share/lq-ai/gateway.yaml.example'`.
- [ ] Token-only `.env` + a fresh `docker-compose.release.yml` stack → `/research` enabled, a case-law
      search returns results, a case-law chat turn shows the sources pill — **no config editing**.
- [ ] No-token stack → gateway starts clean, `/research` shows "not enabled" (skip warning in logs, no crash).

---

## Final verification (before whole-branch review + PR)

- [ ] `npm run lint` clean; root `npx vitest run` green; `cd desktop && npx vitest run` green; desktop typecheck/build green.
- [ ] `bash docker/gateway-config.test.sh` → OK. `docker compose -f docker-compose.release.yml config -q` → no error.
- [ ] `diff docker-compose.release.yml desktop/resources/docker-compose.release.yml` → identical.
- [ ] Whole-branch review (superpowers:requesting-code-review); PR with a **merge commit**; mirror `tucuxi`.

## Spec → task coverage map

- Spec §1 wrapper bake → Task 1. §2 compose plumbing + §3 `.env.example` → Task 2. §4 desktop → Task 3.
  §6 docs → Task 4. §Testing live turnkey → Task 5. §5 dev (token passthrough) → Task 2 (dev compose).
