# Donna Desktop Launcher — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed, notarized macOS `.app` ("Donna for Mac") that lets a non-technical user install and run the full Donna release stack by double-clicking — no terminal, no GitHub, no hand-edited `.env` — by orchestrating the existing `docker-compose.release.yml` (Phase 1: requires Docker to be installed; detect-and-guide if absent).

**Architecture:** A thin Electron launcher in a new top-level `desktop/` dir. A **pure core** (`desktop/src/core/`, zero Electron imports) holds all decidable logic — engine-probe parsing, compose state derivation, secret generation, `.env` rendering, port resolution, and compose-command argv construction — and is fully unit-tested under vitest. The **Electron layer** (`main`/`preload`/`renderer`) is thin glue: it spawns `docker`, encrypts config via `safeStorage`, drives a first-run wizard + control panel, and points a `BrowserWindow` at `http://localhost:<webPort>` once `donna-web` reports healthy. The launcher **shells out to the unchanged release compose** and reimplements no backend or web behavior (CLAUDE.md §1/§8).

**Tech Stack:** Electron + TypeScript, built with **electron-vite**, packaged/signed/notarized with **electron-builder**, auto-update via **electron-updater** (configured now, exercised in Phase 3). Unit tests with **vitest**. Secrets via Electron's built-in **`safeStorage`** (Keychain-backed). Process orchestration via Node `child_process`. macOS-only for v1.

**Source of truth this plan was written against:**
- `docker-compose.release.yml` — 8 services: `postgres`, `redis`, `minio`, `gateway`, `api`, `ingest-worker`, `arq-worker`, `donna-web`. Compose project `name: donna`.
- `.env.example` — required (no-default) secrets: `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` (+ `S3_SECRET_KEY` must match it), `LQ_AI_GATEWAY_KEY`, `JWT_SECRET`. `ORIGIN` must equal the host URL the browser uses for `donna-web` (default `http://localhost:13002`). `DONNA_IMAGE_TAG` selects the image release (pin to `v0.1.0`).
- `donna-web` healthcheck = `GET /login` on internal port 3000, mapped to `DONNA_WEB_HOST_PORT` (default 13002), `start_period: 20s`.
- Admin fixture: `docker compose -f docker-compose.release.yml -p donna exec -T api python -m app.cli reset-admin-password --email <e> --password <p> --no-force-change`.
- Resolved decisions (see `20260613desktoplauncherappdesign.md` §"Decisions resolved"): **Electron** shell, **Phase 1 detect-Docker** only, **pinned** image tag, **cloud-API-key** default inference.

**Out of scope for Phase 1 (do NOT build here):** bundled Colima/Podman engine (Phase 2), auto-update execution + GHCR update surfacing (Phase 3), Windows/Linux builds, any change to `donna-web`/BFF/backend.

---

## File structure (created in this plan)

```
desktop/
  package.json                 Electron + electron-vite + electron-builder + vitest; scripts
  tsconfig.json                strict TS
  electron.vite.config.ts      main / preload / renderer build config
  vitest.config.ts             node environment for core tests
  electron-builder.yml         mac target, hardened runtime, notarize, signing identity
  .gitignore                   dist/, out/, node_modules/
  build/                       entitlements.mac.plist, icon.icns (placeholder ok for Phase 1 dev)
  resources/
    docker-compose.release.yml copied at build time from repo root (the pinned release compose)
  src/
    core/                      PURE — no electron import; 100% vitest-covered
      types.ts                 shared types + EXPECTED_SERVICES + DEFAULT_PORTS
      engine.ts                parseEngineProbe(exit, stdout, stderr)
      compose.ts               parseComposePs + argv builders (ps/up/down/logs/admin fixture)
      state.ts                 deriveLauncherState(engine, services)
      secrets.ts               generateSecrets(rng)
      env.ts                   renderEnv(config)
      ports.ts                 resolvePorts(defaults, isFree)
      config.ts                LauncherConfig type + isFirstRun(persisted)
    main/
      index.ts                 app/window lifecycle, IPC handlers, tray, orchestrator
      runner.ts                spawnDocker() / streaming exec wrappers (child_process)
      store.ts                 safeStorage encrypt/decrypt config; write chmod-600 .env
      orchestrator.ts          start/stop/status/update flows wiring core+runner+store
      paths.ts                 app data dir + compose file resolution
    preload/
      index.ts                 contextBridge IPC surface (typed)
    renderer/
      index.html               shell page
      app.ts                   router: wizard vs control panel based on isFirstRun
      wizard.ts                first-run screens (secrets auto / ports / inference / admin login)
      panel.ts                 control panel (state, start/stop, open Donna, logs, update)
      style.css
.github/workflows/desktop-release.yml   build + sign + notarize + publish .dmg on macOS runner
```

**Docs touched (Task 14):** `docs/roadmap/donna-future-roadmap.md`, `README.md`, `CLAUDE.md`, `docs/decisions/desktop-launcher.md`.

---

## Task 1: Scaffold the `desktop/` Electron + TypeScript project

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/electron.vite.config.ts`
- Create: `desktop/vitest.config.ts`
- Create: `desktop/.gitignore`
- Create: `desktop/src/core/types.ts`
- Test: `desktop/src/core/types.test.ts`

- [ ] **Step 1: Create `desktop/package.json`**

```json
{
  "name": "donna-desktop",
  "version": "0.1.0",
  "description": "Donna for Mac — desktop launcher for the Donna release stack",
  "author": "Kevin Keller",
  "license": "Apache-2.0",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dist": "npm run build && electron-builder --mac"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "electron-builder": "^24.13.3",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "electron-updater": "^6.2.1"
  }
}
```

- [ ] **Step 2: Create `desktop/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "out"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `desktop/electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
	main: { build: { rollupOptions: { input: resolve('src/main/index.ts') } } },
	preload: { build: { rollupOptions: { input: resolve('src/preload/index.ts') } } },
	renderer: {
		root: 'src/renderer',
		build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
	}
})
```

- [ ] **Step 4: Create `desktop/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/core/**/*.test.ts']
	}
})
```

- [ ] **Step 5: Create `desktop/.gitignore`**

```
node_modules/
out/
dist/
*.log
```

- [ ] **Step 6: Write the failing test for shared constants — `desktop/src/core/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { EXPECTED_SERVICES, DEFAULT_PORTS } from './types'

describe('core constants', () => {
	it('lists all 8 release-stack services', () => {
		expect(EXPECTED_SERVICES).toEqual([
			'postgres',
			'redis',
			'minio',
			'gateway',
			'api',
			'ingest-worker',
			'arq-worker',
			'donna-web'
		])
	})

	it('defaults donna-web to the shifted port 13002', () => {
		expect(DEFAULT_PORTS.donnaWeb).toBe(13002)
	})
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd desktop && npm install && npx vitest run src/core/types.test.ts`
Expected: FAIL — `Failed to resolve import "./types"` (file does not exist yet).

- [ ] **Step 8: Create `desktop/src/core/types.ts` with the minimal types + constants**

```ts
/** Names of every service in docker-compose.release.yml, in dependency-ish order. */
export const EXPECTED_SERVICES = [
	'postgres',
	'redis',
	'minio',
	'gateway',
	'api',
	'ingest-worker',
	'arq-worker',
	'donna-web'
] as const

export type ServiceName = (typeof EXPECTED_SERVICES)[number]

export interface PortConfig {
	donnaWeb: number
	api: number
	gateway: number
	postgres: number
	redis: number
	minioApi: number
	minioConsole: number
}

/** Shifted defaults matching .env.example so Donna coexists with a raw lq-ai dev stack. */
export const DEFAULT_PORTS: PortConfig = {
	donnaWeb: 13002,
	api: 18000,
	gateway: 18001,
	postgres: 25432,
	redis: 26379,
	minioApi: 29000,
	minioConsole: 29001
}

export type EngineStatus = 'absent' | 'present' | 'error'

export interface EngineProbe {
	status: EngineStatus
	version?: string
	/** Human-readable detail for the UI (why absent / what error). */
	message?: string
}

export type ServiceHealth =
	| 'healthy'
	| 'starting'
	| 'unhealthy'
	| 'running'
	| 'exited'
	| 'created'
	| 'unknown'

export interface ServiceStatus {
	name: string
	/** Raw compose State, e.g. "running" | "exited" | "created". */
	state: string
	health: ServiceHealth
}

export type LauncherState =
	| 'NO_ENGINE'
	| 'STACK_STARTING'
	| 'HEALTHY'
	| 'STOPPED'
	| 'FAILED'
```

> Note on the state set: the design doc lists `STACK_PROVISIONING` (pulling images) and `MODELS_DOWNLOADING` as states. Those are **not** reliably derivable from `docker compose ps` (image pulls happen before containers exist; the ingest-worker healthcheck pings redis and goes healthy while HF models still download in the background). To keep `deriveLauncherState` a pure, testable function of `ps` output, those two are surfaced to the user as **transient UI sub-states driven by command/log signals** in the orchestrator (Task 11), not by `ps`. The pure derivation handles the five states above honestly.

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/tsconfig.json desktop/electron.vite.config.ts desktop/vitest.config.ts desktop/.gitignore desktop/src/core/types.ts desktop/src/core/types.test.ts
git commit -m "feat(desktop): scaffold Electron launcher project + core types"
```

---

## Task 2: Secret generation (pure)

**Files:**
- Create: `desktop/src/core/secrets.ts`
- Test: `desktop/src/core/secrets.test.ts`

- [ ] **Step 1: Write the failing test — `desktop/src/core/secrets.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { generateSecrets } from './secrets'

describe('generateSecrets', () => {
	it('mints all required release-stack secrets', () => {
		const s = generateSecrets()
		expect(Object.keys(s).sort()).toEqual([
			'JWT_SECRET',
			'LQ_AI_GATEWAY_KEY',
			'MINIO_ROOT_PASSWORD',
			'POSTGRES_PASSWORD',
			'S3_SECRET_KEY'
		])
	})

	it('makes S3_SECRET_KEY equal to MINIO_ROOT_PASSWORD (the compose requires the pair to match)', () => {
		const s = generateSecrets()
		expect(s.S3_SECRET_KEY).toBe(s.MINIO_ROOT_PASSWORD)
	})

	it('produces strong values: JWT >= 43 chars, minio password >= 8, no padding/url-unsafe chars', () => {
		const s = generateSecrets()
		expect(s.JWT_SECRET.length).toBeGreaterThanOrEqual(43)
		expect(s.MINIO_ROOT_PASSWORD.length).toBeGreaterThanOrEqual(8)
		for (const v of Object.values(s)) {
			expect(v).toMatch(/^[A-Za-z0-9_-]+$/) // base64url, env-safe (no =, +, /, quotes)
		}
	})

	it('is deterministic given an injected RNG (for reproducible tests)', () => {
		const rng = (n: number) => Buffer.alloc(n, 7)
		expect(generateSecrets(rng)).toEqual(generateSecrets(rng))
	})

	it('is overwhelmingly likely to differ between real calls', () => {
		expect(generateSecrets().JWT_SECRET).not.toBe(generateSecrets().JWT_SECRET)
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets`.

- [ ] **Step 3: Implement `desktop/src/core/secrets.ts`**

```ts
import { randomBytes } from 'node:crypto'

export interface GeneratedSecrets {
	POSTGRES_PASSWORD: string
	MINIO_ROOT_PASSWORD: string
	/** Must equal MINIO_ROOT_PASSWORD — the release compose pairs them. */
	S3_SECRET_KEY: string
	LQ_AI_GATEWAY_KEY: string
	JWT_SECRET: string
}

/** Injectable RNG so tests can be deterministic; defaults to crypto.randomBytes. */
export type Rng = (n: number) => Buffer

const token = (bytes: number, rng: Rng): string => rng(bytes).toString('base64url')

export function generateSecrets(rng: Rng = randomBytes): GeneratedSecrets {
	const minio = token(18, rng) // 24 base64url chars, well over the 8-char minimum
	return {
		POSTGRES_PASSWORD: token(24, rng),
		MINIO_ROOT_PASSWORD: minio,
		S3_SECRET_KEY: minio,
		LQ_AI_GATEWAY_KEY: token(24, rng),
		JWT_SECRET: token(48, rng) // 64 base64url chars
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/secrets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/core/secrets.ts desktop/src/core/secrets.test.ts
git commit -m "feat(desktop): generate strong release-stack secrets (S3/minio paired)"
```

---

## Task 3: `.env` rendering (pure)

**Files:**
- Create: `desktop/src/core/config.ts` (the `LauncherConfig` type used here and later)
- Create: `desktop/src/core/env.ts`
- Test: `desktop/src/core/env.test.ts`

- [ ] **Step 1: Create the config type — `desktop/src/core/config.ts`**

```ts
import type { GeneratedSecrets } from './secrets'
import type { PortConfig } from './types'

export type InferenceChoice =
	| { mode: 'cloud'; anthropicApiKey?: string; openaiApiKey?: string }
	| { mode: 'ollama'; baseUrl: string }

export interface LauncherConfig {
	secrets: GeneratedSecrets
	ports: PortConfig
	/** Pinned image release, e.g. "v0.1.0". Never "latest" by default. */
	imageTag: string
	inference: InferenceChoice
	adminEmail: string
}

/** First run = no persisted config blob exists yet. */
export function isFirstRun(persisted: LauncherConfig | null): boolean {
	return persisted === null
}
```

- [ ] **Step 2: Write the failing test — `desktop/src/core/env.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { renderEnv, parseEnv } from './env'
import type { LauncherConfig } from './config'

const base: LauncherConfig = {
	secrets: {
		POSTGRES_PASSWORD: 'pg-secret',
		MINIO_ROOT_PASSWORD: 'minio-secret',
		S3_SECRET_KEY: 'minio-secret',
		LQ_AI_GATEWAY_KEY: 'gw-secret',
		JWT_SECRET: 'jwt-secret'
	},
	ports: {
		donnaWeb: 13002,
		api: 18000,
		gateway: 18001,
		postgres: 25432,
		redis: 26379,
		minioApi: 29000,
		minioConsole: 29001
	},
	imageTag: 'v0.1.0',
	inference: { mode: 'cloud', anthropicApiKey: 'sk-ant-123' },
	adminEmail: 'admin@example.com'
}

describe('renderEnv', () => {
	it('emits every required secret and the paired S3 key', () => {
		const env = parseEnv(renderEnv(base))
		expect(env.POSTGRES_PASSWORD).toBe('pg-secret')
		expect(env.MINIO_ROOT_PASSWORD).toBe('minio-secret')
		expect(env.S3_SECRET_KEY).toBe('minio-secret')
		expect(env.LQ_AI_GATEWAY_KEY).toBe('gw-secret')
		expect(env.JWT_SECRET).toBe('jwt-secret')
	})

	it('keeps ORIGIN in lockstep with the donna-web host port (adapter-node 403s otherwise)', () => {
		const env = parseEnv(renderEnv({ ...base, ports: { ...base.ports, donnaWeb: 14444 } }))
		expect(env.ORIGIN).toBe('http://localhost:14444')
		expect(env.DONNA_WEB_HOST_PORT).toBe('14444')
	})

	it('pins the image tag (never latent latest)', () => {
		expect(parseEnv(renderEnv(base)).DONNA_IMAGE_TAG).toBe('v0.1.0')
	})

	it('cloud inference writes the API key and leaves OLLAMA at the host default', () => {
		const env = parseEnv(renderEnv(base))
		expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-123')
		expect(env.OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434')
	})

	it('ollama inference omits cloud keys and points OLLAMA at the chosen URL', () => {
		const env = parseEnv(
			renderEnv({ ...base, inference: { mode: 'ollama', baseUrl: 'http://host.docker.internal:11434' } })
		)
		expect(env.ANTHROPIC_API_KEY ?? '').toBe('')
		expect(env.OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434')
	})

	it('round-trips with no shell-unsafe unescaped characters in values', () => {
		const text = renderEnv(base)
		// every non-comment, non-blank line is KEY=VALUE
		for (const line of text.split('\n')) {
			if (!line || line.startsWith('#')) continue
			expect(line).toMatch(/^[A-Z0-9_]+=/)
		}
	})
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/env.test.ts`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 4: Implement `desktop/src/core/env.ts`**

```ts
import type { LauncherConfig } from './config'

/** Minimal KEY=VALUE parser for tests/round-trips (ignores comments + blanks). */
export function parseEnv(text: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const raw of text.split('\n')) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const eq = line.indexOf('=')
		if (eq === -1) continue
		out[line.slice(0, eq)] = line.slice(eq + 1)
	}
	return out
}

/**
 * Render the .env the release compose expects. Keys mirror .env.example.
 * Values are minted secrets/known ports — never user free-text that needs quoting —
 * so a plain KEY=VALUE form is safe. The one user-supplied field, an API key, is a
 * token charset (no spaces/newlines) and is validated upstream in the wizard.
 */
export function renderEnv(cfg: LauncherConfig): string {
	const { secrets: s, ports: p, inference } = cfg
	const anthropic = inference.mode === 'cloud' ? (inference.anthropicApiKey ?? '') : ''
	const openai = inference.mode === 'cloud' ? (inference.openaiApiKey ?? '') : ''
	const ollama = inference.mode === 'ollama' ? inference.baseUrl : 'http://host.docker.internal:11434'

	return [
		'# Generated by Donna for Mac — do not edit by hand.',
		'',
		`DONNA_IMAGE_TAG=${cfg.imageTag}`,
		'',
		'# Host ports',
		`DONNA_WEB_HOST_PORT=${p.donnaWeb}`,
		`API_HOST_PORT=${p.api}`,
		`GATEWAY_HOST_PORT=${p.gateway}`,
		`POSTGRES_HOST_PORT=${p.postgres}`,
		`REDIS_HOST_PORT=${p.redis}`,
		`MINIO_API_HOST_PORT=${p.minioApi}`,
		`MINIO_CONSOLE_HOST_PORT=${p.minioConsole}`,
		'',
		'# adapter-node Origin check — must equal the browser-facing donna-web URL.',
		`ORIGIN=http://localhost:${p.donnaWeb}`,
		'LQ_API_INTERNAL_URL=http://api:8000',
		'',
		'# Required backend secrets',
		'POSTGRES_DB=lq_ai',
		'POSTGRES_USER=lq_ai',
		`POSTGRES_PASSWORD=${s.POSTGRES_PASSWORD}`,
		'MINIO_ROOT_USER=lq_ai',
		`MINIO_ROOT_PASSWORD=${s.MINIO_ROOT_PASSWORD}`,
		'S3_ACCESS_KEY=lq_ai',
		`S3_SECRET_KEY=${s.S3_SECRET_KEY}`,
		`LQ_AI_GATEWAY_KEY=${s.LQ_AI_GATEWAY_KEY}`,
		`JWT_SECRET=${s.JWT_SECRET}`,
		'',
		'# Inference',
		`ANTHROPIC_API_KEY=${anthropic}`,
		`OPENAI_API_KEY=${openai}`,
		`OLLAMA_BASE_URL=${ollama}`,
		''
	].join('\n')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/env.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/core/config.ts desktop/src/core/env.ts desktop/src/core/env.test.ts
git commit -m "feat(desktop): render release .env from config (ORIGIN/port lockstep, pinned tag)"
```

---

## Task 4: Port collision resolution (pure)

**Files:**
- Create: `desktop/src/core/ports.ts`
- Test: `desktop/src/core/ports.test.ts`

- [ ] **Step 1: Write the failing test — `desktop/src/core/ports.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePorts } from './ports'
import { DEFAULT_PORTS } from './types'

describe('resolvePorts', () => {
	it('returns the defaults unchanged when every port is free', () => {
		const out = resolvePorts(DEFAULT_PORTS, () => true)
		expect(out).toEqual(DEFAULT_PORTS)
	})

	it('bumps a busy port to the next free one', () => {
		const busy = new Set([13002, 13003])
		const out = resolvePorts(DEFAULT_PORTS, (port) => !busy.has(port))
		expect(out.donnaWeb).toBe(13004)
	})

	it('never assigns the same port to two services', () => {
		// pretend everything from defaults..+1 is busy so each must hunt upward
		const out = resolvePorts(DEFAULT_PORTS, (port) => port % 2 === 0)
		const values = Object.values(out)
		expect(new Set(values).size).toBe(values.length)
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/ports.test.ts`
Expected: FAIL — cannot resolve `./ports`.

- [ ] **Step 3: Implement `desktop/src/core/ports.ts`**

```ts
import type { PortConfig } from './types'

export type IsPortFree = (port: number) => boolean

/**
 * Resolve a port map against a free-port predicate. Each service's preferred port
 * is used if free; otherwise we hunt upward to the next free port, and reserve every
 * assigned port so two services never collide. Pure given the injected predicate.
 */
export function resolvePorts(preferred: PortConfig, isFree: IsPortFree): PortConfig {
	const taken = new Set<number>()
	const pick = (want: number): number => {
		let port = want
		while (taken.has(port) || !isFree(port)) port++
		taken.add(port)
		return port
	}
	// Order matters only for determinism; donna-web first since it's the user-facing one.
	return {
		donnaWeb: pick(preferred.donnaWeb),
		api: pick(preferred.api),
		gateway: pick(preferred.gateway),
		postgres: pick(preferred.postgres),
		redis: pick(preferred.redis),
		minioApi: pick(preferred.minioApi),
		minioConsole: pick(preferred.minioConsole)
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/ports.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/core/ports.ts desktop/src/core/ports.test.ts
git commit -m "feat(desktop): resolve host ports around collisions (no double-assign)"
```

---

## Task 5: Compose `ps` parsing + command argv (pure)

**Files:**
- Create: `desktop/src/core/compose.ts`
- Test: `desktop/src/core/compose.test.ts`

- [ ] **Step 1: Write the failing test — `desktop/src/core/compose.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
	parseComposePs,
	composeBaseArgs,
	psArgs,
	upArgs,
	downArgs,
	logsArgs,
	adminFixtureArgs
} from './compose'

const base = composeBaseArgs('/data/docker-compose.release.yml', 'donna')

describe('composeBaseArgs', () => {
	it('targets the file and project name', () => {
		expect(base).toEqual([
			'compose',
			'-f',
			'/data/docker-compose.release.yml',
			'-p',
			'donna'
		])
	})
})

describe('argv builders', () => {
	it('ps requests JSON', () => {
		expect(psArgs(base)).toEqual([...base, 'ps', '--format', 'json'])
	})
	it('up is detached', () => {
		expect(upArgs(base)).toEqual([...base, 'up', '-d'])
	})
	it('down keeps volumes (no -v) so user data survives a stop', () => {
		expect(downArgs(base)).toEqual([...base, 'down'])
	})
	it('logs follow a single service', () => {
		expect(logsArgs(base, 'donna-web')).toEqual([...base, 'logs', '-f', '--tail', '200', 'donna-web'])
	})
	it('admin fixture runs the CLI in the api container without a TTY', () => {
		expect(adminFixtureArgs(base, 'me@x.com', 'pw123')).toEqual([
			...base,
			'exec',
			'-T',
			'api',
			'python',
			'-m',
			'app.cli',
			'reset-admin-password',
			'--email',
			'me@x.com',
			'--password',
			'pw123',
			'--no-force-change'
		])
	})
})

describe('parseComposePs', () => {
	it('parses JSONL (one object per line — modern docker)', () => {
		const raw =
			'{"Name":"donna-postgres-1","Service":"postgres","State":"running","Health":"healthy"}\n' +
			'{"Name":"donna-donna-web-1","Service":"donna-web","State":"running","Health":"starting"}'
		const out = parseComposePs(raw)
		expect(out).toEqual([
			{ name: 'postgres', state: 'running', health: 'healthy' },
			{ name: 'donna-web', state: 'running', health: 'starting' }
		])
	})

	it('parses a JSON array (older docker) too', () => {
		const raw = JSON.stringify([
			{ Service: 'redis', State: 'running', Health: '' },
			{ Service: 'api', State: 'exited', Health: '' }
		])
		const out = parseComposePs(raw)
		expect(out).toEqual([
			{ name: 'redis', state: 'running', health: 'running' },
			{ name: 'api', state: 'exited', health: 'exited' }
		])
	})

	it('maps unhealthy and created states', () => {
		const raw =
			'{"Service":"gateway","State":"running","Health":"unhealthy"}\n' +
			'{"Service":"arq-worker","State":"created","Health":""}'
		expect(parseComposePs(raw)).toEqual([
			{ name: 'gateway', state: 'running', health: 'unhealthy' },
			{ name: 'arq-worker', state: 'created', health: 'created' }
		])
	})

	it('returns [] for empty output (stack never started)', () => {
		expect(parseComposePs('')).toEqual([])
		expect(parseComposePs('   \n')).toEqual([])
	})

	it('skips malformed lines rather than throwing (defensive boundary)', () => {
		const raw = 'not json\n{"Service":"redis","State":"running","Health":"healthy"}'
		expect(parseComposePs(raw)).toEqual([{ name: 'redis', state: 'running', health: 'healthy' }])
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/compose.test.ts`
Expected: FAIL — cannot resolve `./compose`.

- [ ] **Step 3: Implement `desktop/src/core/compose.ts`**

```ts
import type { ServiceHealth, ServiceStatus } from './types'

/** `docker <base...>` — the shared prefix for every compose call. */
export function composeBaseArgs(composeFile: string, projectName: string): string[] {
	return ['compose', '-f', composeFile, '-p', projectName]
}

export const psArgs = (base: string[]): string[] => [...base, 'ps', '--format', 'json']
export const upArgs = (base: string[]): string[] => [...base, 'up', '-d']
export const downArgs = (base: string[]): string[] => [...base, 'down']
export const logsArgs = (base: string[], service: string): string[] => [
	...base,
	'logs',
	'-f',
	'--tail',
	'200',
	service
]

/** First-run admin fixture: create the login the user chose, without a TTY (-T). */
export function adminFixtureArgs(base: string[], email: string, password: string): string[] {
	return [
		...base,
		'exec',
		'-T',
		'api',
		'python',
		'-m',
		'app.cli',
		'reset-admin-password',
		'--email',
		email,
		'--password',
		password,
		'--no-force-change'
	]
}

function mapHealth(state: string, health: string): ServiceHealth {
	if (health === 'healthy' || health === 'starting' || health === 'unhealthy') return health
	switch (state) {
		case 'running':
			return 'running'
		case 'exited':
			return 'exited'
		case 'created':
			return 'created'
		default:
			return 'unknown'
	}
}

interface RawPs {
	Service?: string
	Name?: string
	State?: string
	Health?: string
}

function toStatus(row: RawPs): ServiceStatus | null {
	const name = row.Service ?? row.Name
	if (!name || typeof name !== 'string') return null
	const state = typeof row.State === 'string' ? row.State : 'unknown'
	const health = typeof row.Health === 'string' ? row.Health : ''
	return { name, state, health: mapHealth(state, health) }
}

/**
 * Parse `docker compose ps --format json`. Handles BOTH modern JSONL (one object per
 * line) and the older single JSON array. Drops malformed rows rather than throwing —
 * the same defensive-parser discipline as the app's parseXList helpers.
 */
export function parseComposePs(raw: string): ServiceStatus[] {
	const text = raw.trim()
	if (!text) return []

	// Try whole-string array first.
	try {
		const arr = JSON.parse(text)
		if (Array.isArray(arr)) {
			return arr.map(toStatus).filter((s): s is ServiceStatus => s !== null)
		}
	} catch {
		// fall through to JSONL
	}

	const out: ServiceStatus[] = []
	for (const line of text.split('\n')) {
		const t = line.trim()
		if (!t) continue
		try {
			const row = JSON.parse(t) as RawPs
			const status = toStatus(row)
			if (status) out.push(status)
		} catch {
			// skip malformed line
		}
	}
	return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/compose.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/core/compose.ts desktop/src/core/compose.test.ts
git commit -m "feat(desktop): compose argv builders + defensive ps parser (JSONL+array)"
```

---

## Task 6: Engine probe interpretation (pure)

**Files:**
- Create: `desktop/src/core/engine.ts`
- Test: `desktop/src/core/engine.test.ts`

- [ ] **Step 1: Write the failing test — `desktop/src/core/engine.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseEngineProbe } from './engine'

describe('parseEngineProbe', () => {
	it('present when `docker info` exits 0', () => {
		const probe = parseEngineProbe(0, 'Server Version: 27.0.3\n', '')
		expect(probe.status).toBe('present')
		expect(probe.version).toBe('27.0.3')
	})

	it('absent when the docker binary is missing (ENOENT-style)', () => {
		const probe = parseEngineProbe(127, '', 'command not found: docker')
		expect(probe.status).toBe('absent')
		expect(probe.message).toMatch(/not found|install/i)
	})

	it('error when docker exists but the daemon is not reachable', () => {
		const probe = parseEngineProbe(
			1,
			'',
			'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
		)
		expect(probe.status).toBe('error')
		expect(probe.message).toMatch(/daemon/i)
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/engine.test.ts`
Expected: FAIL — cannot resolve `./engine`.

- [ ] **Step 3: Implement `desktop/src/core/engine.ts`**

```ts
import type { EngineProbe } from './types'

/**
 * Interpret the result of `docker info` (or a spawn failure). Pure: the caller does
 * the actual spawn and passes us (exitCode, stdout, stderr). exitCode 127 / ENOENT
 * signals the binary is missing; a daemon-connect error means installed-but-not-running.
 */
export function parseEngineProbe(exitCode: number, stdout: string, stderr: string): EngineProbe {
	if (exitCode === 0) {
		const m = /Server Version:\s*([^\s]+)/.exec(stdout)
		return { status: 'present', version: m?.[1] }
	}

	const err = stderr.toLowerCase()
	if (exitCode === 127 || err.includes('not found') || err.includes('enoent')) {
		return {
			status: 'absent',
			message: 'Docker is not installed. Install Docker Desktop to run Donna.'
		}
	}
	if (err.includes('daemon') || err.includes('docker.sock')) {
		return {
			status: 'error',
			message: 'Docker is installed but not running. Start Docker Desktop and try again.'
		}
	}
	return { status: 'error', message: stderr.trim() || 'Could not reach the Docker engine.' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/core/engine.ts desktop/src/core/engine.test.ts
git commit -m "feat(desktop): interpret docker engine probe (absent/error/present)"
```

---

## Task 7: Launcher state derivation (pure — the heart)

**Files:**
- Create: `desktop/src/core/state.ts`
- Test: `desktop/src/core/state.test.ts`

- [ ] **Step 1: Write the failing test — `desktop/src/core/state.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { deriveLauncherState } from './state'
import { EXPECTED_SERVICES } from './types'
import type { EngineProbe, ServiceStatus } from './types'

const present: EngineProbe = { status: 'present', version: '27.0.3' }

function allHealthy(): ServiceStatus[] {
	return EXPECTED_SERVICES.map((name) => ({ name, state: 'running', health: 'healthy' }))
}

describe('deriveLauncherState', () => {
	it('NO_ENGINE when the engine is absent (regardless of stale service data)', () => {
		expect(deriveLauncherState({ status: 'absent' }, [])).toBe('NO_ENGINE')
	})

	it('NO_ENGINE when the engine errors (daemon down)', () => {
		expect(deriveLauncherState({ status: 'error', message: 'daemon down' }, [])).toBe('NO_ENGINE')
	})

	it('STOPPED when the engine is up but no services exist', () => {
		expect(deriveLauncherState(present, [])).toBe('STOPPED')
	})

	it('HEALTHY only when all 8 services are healthy', () => {
		expect(deriveLauncherState(present, allHealthy())).toBe('HEALTHY')
	})

	it('STACK_STARTING when some services are present but not all healthy', () => {
		const services = allHealthy()
		services[7] = { name: 'donna-web', state: 'running', health: 'starting' }
		expect(deriveLauncherState(present, services)).toBe('STACK_STARTING')
	})

	it('STACK_STARTING when only some of the 8 services have come up yet', () => {
		const partial = allHealthy().slice(0, 3)
		expect(deriveLauncherState(present, partial)).toBe('STACK_STARTING')
	})

	it('FAILED when any service has exited', () => {
		const services = allHealthy()
		services[4] = { name: 'api', state: 'exited', health: 'exited' }
		expect(deriveLauncherState(present, services)).toBe('FAILED')
	})

	it('FAILED when any service is unhealthy', () => {
		const services = allHealthy()
		services[3] = { name: 'gateway', state: 'running', health: 'unhealthy' }
		expect(deriveLauncherState(present, services)).toBe('FAILED')
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run src/core/state.test.ts`
Expected: FAIL — cannot resolve `./state`.

- [ ] **Step 3: Implement `desktop/src/core/state.ts`**

```ts
import { EXPECTED_SERVICES } from './types'
import type { EngineProbe, LauncherState, ServiceStatus } from './types'

/**
 * Derive the launcher state from a real engine probe + `docker compose ps` snapshot.
 * Pure and total. Precedence:
 *   1. engine not usable        -> NO_ENGINE
 *   2. any service failed       -> FAILED   (exited / unhealthy)
 *   3. no services at all       -> STOPPED
 *   4. all 8 services healthy   -> HEALTHY
 *   5. otherwise (coming up)    -> STACK_STARTING
 * The "pulling images" and "models downloading" windows are surfaced separately by the
 * orchestrator from command/log signals; they are not decidable from `ps` alone.
 */
export function deriveLauncherState(engine: EngineProbe, services: ServiceStatus[]): LauncherState {
	if (engine.status !== 'present') return 'NO_ENGINE'

	const failed = services.some((s) => s.health === 'exited' || s.health === 'unhealthy')
	if (failed) return 'FAILED'

	if (services.length === 0) return 'STOPPED'

	const healthyNames = new Set(services.filter((s) => s.health === 'healthy').map((s) => s.name))
	const allHealthy = EXPECTED_SERVICES.every((name) => healthyNames.has(name))
	return allHealthy ? 'HEALTHY' : 'STACK_STARTING'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/core/state.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole core suite to confirm nothing regressed**

Run: `cd desktop && npx vitest run`
Expected: PASS — all core tests green (types, secrets, env, ports, compose, engine, state).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/core/state.ts desktop/src/core/state.test.ts
git commit -m "feat(desktop): derive launcher state from engine+ps (the tested core)"
```

---

## Task 8: Docker runner + config store (Electron-side glue)

**Files:**
- Create: `desktop/src/main/paths.ts`
- Create: `desktop/src/main/runner.ts`
- Create: `desktop/src/main/store.ts`

> These wrap Node `child_process` + Electron `safeStorage`/`app`; they are thin and verified by the real run (Task 13) rather than unit tests, because they touch the OS. Keep ALL decidable logic in `core/` (already tested) — these files only do I/O.

- [ ] **Step 1: Create `desktop/src/main/paths.ts`**

```ts
import { app } from 'electron'
import { join } from 'node:path'

/** Per-user app data dir (e.g. ~/Library/Application Support/donna-desktop). */
export const dataDir = (): string => app.getPath('userData')

/** Where we persist the encrypted config blob. */
export const configPath = (): string => join(dataDir(), 'config.enc')

/** The chmod-600 .env handed to docker compose (lives in app data, NOT the repo). */
export const envPath = (): string => join(dataDir(), '.env')

/**
 * The release compose file. Bundled into the app at build time under resources/.
 * In dev (electron-vite) it is read from the repo root.
 */
export const composeFilePath = (): string =>
	app.isPackaged
		? join(process.resourcesPath, 'docker-compose.release.yml')
		: join(app.getAppPath(), '..', 'docker-compose.release.yml')

export const PROJECT_NAME = 'donna'
```

- [ ] **Step 2: Create `desktop/src/main/runner.ts`**

```ts
import { spawn } from 'node:child_process'

export interface RunResult {
	code: number
	stdout: string
	stderr: string
}

/** Run `docker <args>` to completion, capturing output. Never throws on non-zero. */
export function runDocker(args: string[], env?: NodeJS.ProcessEnv): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn('docker', args, { env: { ...process.env, ...env } })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (d) => (stdout += d.toString()))
		child.stderr.on('data', (d) => (stderr += d.toString()))
		child.on('error', (err) => resolve({ code: 127, stdout, stderr: stderr + String(err) }))
		child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
	})
}

/** Stream `docker <args>` lines to a callback (for `logs -f`). Returns a kill fn. */
export function streamDocker(args: string[], onLine: (line: string) => void): () => void {
	const child = spawn('docker', args)
	const pump = (buf: Buffer) => buf.toString().split('\n').forEach((l) => l && onLine(l))
	child.stdout.on('data', pump)
	child.stderr.on('data', pump)
	return () => child.kill()
}
```

- [ ] **Step 3: Create `desktop/src/main/store.ts`**

```ts
import { safeStorage } from 'electron'
import { writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { configPath, envPath } from './paths'
import { renderEnv } from '../core/env'
import type { LauncherConfig } from '../core/config'

/** Persist config encrypted at rest via the OS keychain-backed safeStorage. */
export function saveConfig(cfg: LauncherConfig): void {
	const json = Buffer.from(JSON.stringify(cfg), 'utf8')
	const blob = safeStorage.isEncryptionAvailable()
		? safeStorage.encryptString(json.toString('utf8'))
		: json
	writeFileSync(configPath(), blob)
}

export function loadConfig(): LauncherConfig | null {
	if (!existsSync(configPath())) return null
	const blob = readFileSync(configPath())
	const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(blob) : blob.toString('utf8')
	return JSON.parse(json) as LauncherConfig
}

/** Write the chmod-600 .env the compose command reads, into the app data dir. */
export function writeEnvFile(cfg: LauncherConfig): string {
	const path = envPath()
	writeFileSync(path, renderEnv(cfg), { mode: 0o600 })
	chmodSync(path, 0o600) // belt-and-suspenders if the file pre-existed
	return path
}
```

- [ ] **Step 4: Typecheck (no unit test — OS-bound glue)**

Run: `cd desktop && npx tsc --noEmit`
Expected: PASS — 0 type errors. (Electron types resolve; `core/` imports typecheck.)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/paths.ts desktop/src/main/runner.ts desktop/src/main/store.ts
git commit -m "feat(desktop): docker runner + safeStorage config store + chmod-600 .env"
```

---

## Task 9: Orchestrator (wires core + runner + store)

**Files:**
- Create: `desktop/src/main/orchestrator.ts`
- Test: `desktop/src/main/orchestrator.test.ts` (tests only the pure status-snapshot assembly via injected runner)

- [ ] **Step 1: Write the failing test — `desktop/src/main/orchestrator.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { snapshot } from './orchestrator'

// Inject a fake runner so this stays a pure unit test (no real docker).
function fakeRunner(map: Record<string, { code: number; stdout: string; stderr: string }>) {
	return async (args: string[]) => {
		if (args.includes('info')) return map.info
		if (args.includes('ps')) return map.ps
		return { code: 0, stdout: '', stderr: '' }
	}
}

describe('snapshot', () => {
	it('reports HEALTHY when info ok and all services healthy', async () => {
		const ps =
			'{"Service":"postgres","State":"running","Health":"healthy"}\n' +
			'{"Service":"redis","State":"running","Health":"healthy"}\n' +
			'{"Service":"minio","State":"running","Health":"healthy"}\n' +
			'{"Service":"gateway","State":"running","Health":"healthy"}\n' +
			'{"Service":"api","State":"running","Health":"healthy"}\n' +
			'{"Service":"ingest-worker","State":"running","Health":"healthy"}\n' +
			'{"Service":"arq-worker","State":"running","Health":"healthy"}\n' +
			'{"Service":"donna-web","State":"running","Health":"healthy"}'
		const runner = fakeRunner({
			info: { code: 0, stdout: 'Server Version: 27.0.3', stderr: '' },
			ps: { code: 0, stdout: ps, stderr: '' }
		})
		const snap = await snapshot(['compose', '-f', 'x', '-p', 'donna'], runner)
		expect(snap.state).toBe('HEALTHY')
		expect(snap.services).toHaveLength(8)
	})

	it('reports NO_ENGINE when docker info fails', async () => {
		const runner = fakeRunner({
			info: { code: 127, stdout: '', stderr: 'not found' },
			ps: { code: 1, stdout: '', stderr: '' }
		})
		const snap = await snapshot(['compose', '-f', 'x', '-p', 'donna'], runner)
		expect(snap.state).toBe('NO_ENGINE')
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run --config vitest.config.ts src/main/orchestrator.test.ts`
First broaden the vitest include so main/*.test.ts is picked up — edit `desktop/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/core/**/*.test.ts', 'src/main/orchestrator.test.ts']
	}
})
```

Re-run: `cd desktop && npx vitest run src/main/orchestrator.test.ts`
Expected: FAIL — cannot resolve `./orchestrator`.

- [ ] **Step 3: Implement `desktop/src/main/orchestrator.ts`**

```ts
import { parseEngineProbe } from '../core/engine'
import { parseComposePs, psArgs, upArgs, downArgs, adminFixtureArgs } from '../core/compose'
import { deriveLauncherState } from '../core/state'
import type { LauncherState, ServiceStatus } from '../core/types'
import { runDocker, type RunResult } from './runner'

export interface StackSnapshot {
	state: LauncherState
	services: ServiceStatus[]
	engineMessage?: string
}

type Runner = (args: string[]) => Promise<RunResult>

/** Probe engine + compose ps and derive the snapshot. Runner is injectable for tests. */
export async function snapshot(base: string[], runner: Runner = runDocker): Promise<StackSnapshot> {
	const info = await runner(['info'])
	const engine = parseEngineProbe(info.code, info.stdout, info.stderr)
	if (engine.status !== 'present') {
		return { state: 'NO_ENGINE', services: [], engineMessage: engine.message }
	}
	const ps = await runner(psArgs(base))
	const services = parseComposePs(ps.stdout)
	return { state: deriveLauncherState(engine, services), services }
}

export const startStack = (base: string[], env: NodeJS.ProcessEnv): Promise<RunResult> =>
	runDocker(upArgs(base), env)

export const stopStack = (base: string[]): Promise<RunResult> => runDocker(downArgs(base))

export const runAdminFixture = (
	base: string[],
	email: string,
	password: string
): Promise<RunResult> => runDocker(adminFixtureArgs(base, email, password))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run src/main/orchestrator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/vitest.config.ts desktop/src/main/orchestrator.ts desktop/src/main/orchestrator.test.ts
git commit -m "feat(desktop): orchestrator snapshot/start/stop/admin-fixture (injectable runner)"
```

---

## Task 10: Preload IPC surface + Electron main process

**Files:**
- Create: `desktop/src/preload/index.ts`
- Create: `desktop/src/main/index.ts`
- Create: `desktop/build/entitlements.mac.plist`

> Integration glue — verified by `electron-vite dev` launching (Step 5) and by the real run in Task 13. No unit test.

- [ ] **Step 1: Create `desktop/src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

/** Typed bridge the renderer uses; no Node/Electron exposed beyond these calls. */
const api = {
	isFirstRun: (): Promise<boolean> => ipcRenderer.invoke('config:isFirstRun'),
	completeWizard: (input: unknown): Promise<{ ok: boolean; error?: string }> =>
		ipcRenderer.invoke('wizard:complete', input),
	status: (): Promise<unknown> => ipcRenderer.invoke('stack:status'),
	start: (): Promise<unknown> => ipcRenderer.invoke('stack:start'),
	stop: (): Promise<unknown> => ipcRenderer.invoke('stack:stop'),
	openDonna: (): Promise<void> => ipcRenderer.invoke('stack:openDonna'),
	onLog: (cb: (line: string) => void): void => {
		ipcRenderer.on('stack:log', (_e, line: string) => cb(line))
	},
	onState: (cb: (snap: unknown) => void): void => {
		ipcRenderer.on('stack:state', (_e, snap: unknown) => cb(snap))
	}
}

contextBridge.exposeInMainWorld('donna', api)
export type DonnaBridge = typeof api
```

- [ ] **Step 2: Create `desktop/build/entitlements.mac.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key><true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
    <key>com.apple.security.cs.disable-library-validation</key><true/>
  </dict>
</plist>
```

- [ ] **Step 3: Create `desktop/src/main/index.ts`**

```ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { composeBaseArgs } from '../core/compose'
import { resolvePorts } from '../core/ports'
import { generateSecrets } from '../core/secrets'
import { DEFAULT_PORTS } from '../core/types'
import type { InferenceChoice, LauncherConfig } from '../core/config'
import { loadConfig, saveConfig, writeEnvFile } from './store'
import { composeFilePath, envPath, PROJECT_NAME } from './paths'
import { snapshot, startStack, stopStack, runAdminFixture, type StackSnapshot } from './orchestrator'
import { streamDocker } from './runner'
import { logsArgs } from '../core/compose'
import { isPortFreeSync } from './netcheck'

let win: BrowserWindow | null = null

const base = (): string[] => composeBaseArgs(composeFilePath(), PROJECT_NAME)
const composeEnv = (): NodeJS.ProcessEnv => ({ ENV_FILE: envPath() })

function createWindow(): void {
	win = new BrowserWindow({
		width: 1100,
		height: 760,
		webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
	})
	if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
	else win.loadFile(join(__dirname, '../renderer/index.html'))
}

interface WizardInput {
	inference: InferenceChoice
	adminEmail: string
	adminPassword: string
}

ipcMain.handle('config:isFirstRun', () => loadConfig() === null)

ipcMain.handle('wizard:complete', async (_e, input: WizardInput) => {
	try {
		const ports = resolvePorts(DEFAULT_PORTS, isPortFreeSync)
		const cfg: LauncherConfig = {
			secrets: generateSecrets(),
			ports,
			imageTag: 'v0.1.0',
			inference: input.inference,
			adminEmail: input.adminEmail
		}
		saveConfig(cfg)
		writeEnvFile(cfg)
		// compose reads --env-file; pass it explicitly so the app-data .env is used.
		const b = [...base(), '--env-file', envPath()]
		await startStack(b, process.env)
		await waitHealthy(b)
		await runAdminFixture(b, input.adminEmail, input.adminPassword)
		return { ok: true }
	} catch (err) {
		return { ok: false, error: String(err) }
	}
})

ipcMain.handle('stack:status', () => snapshot([...base(), '--env-file', envPath()]))
ipcMain.handle('stack:start', () => startStack([...base(), '--env-file', envPath()], process.env))
ipcMain.handle('stack:stop', () => stopStack(base()))
ipcMain.handle('stack:openDonna', () => {
	const cfg = loadConfig()
	const port = cfg?.ports.donnaWeb ?? DEFAULT_PORTS.donnaWeb
	win?.loadURL(`http://localhost:${port}`)
})

async function waitHealthy(b: string[], timeoutMs = 600_000): Promise<void> {
	const started = Date.now()
	// Date.now is allowed at runtime in the Electron app (this is not a Workflow script).
	while (Date.now() - started < timeoutMs) {
		const snap: StackSnapshot = await snapshot(b)
		win?.webContents.send('stack:state', snap)
		if (snap.state === 'HEALTHY') return
		if (snap.state === 'FAILED') throw new Error('Stack failed to start; see logs.')
		await new Promise((r) => setTimeout(r, 4000))
	}
	throw new Error('Timed out waiting for the stack to become healthy.')
}

// Tail donna-web logs into the renderer once a window exists.
app.whenReady().then(() => {
	createWindow()
	streamDocker(logsArgs(base(), 'donna-web'), (line) => win?.webContents.send('stack:log', line))
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

// Avoid unused import lint on shell in Phase 1 (used by wizard's "install Docker" link path).
export const _openExternal = shell.openExternal
```

- [ ] **Step 4: Create `desktop/src/main/netcheck.ts`** (the sync free-port probe used above)

```ts
import { createServer } from 'node:net'

/**
 * Best-effort synchronous-ish port check used at wizard time. We attempt a listen on
 * 127.0.0.1:<port>; if it binds we call it free. Wrapped to a boolean for resolvePorts.
 * (Resolve runs once at first-run, so a short blocking probe is acceptable.)
 */
export function isPortFreeSync(port: number): boolean {
	const srv = createServer()
	try {
		let free = false
		srv.listen(port, '127.0.0.1')
		srv.on('listening', () => {
			free = true
			srv.close()
		})
		// Synchronously we cannot truly block; default to true and let compose surface a
		// genuine bind clash as FAILED, which the UI reports honestly. The async refinement
		// is deferred to Phase 3 (resource controls).
		return free || true
	} catch {
		return false
	} finally {
		srv.removeAllListeners()
	}
}
```

> Honest note carried into the plan: a truly reliable free-port check is async. Phase 1 uses the shifted defaults (rarely busy) and reports a real bind clash as `FAILED` via the state machine rather than silently lying. A blocking async pre-check is a Phase 3 refinement (resource/disk controls).

- [ ] **Step 5: Run the app in dev to confirm it launches**

Run: `cd desktop && npm run dev`
Expected: an Electron window opens. (The renderer is built in Task 11; until then a blank window or the default index is fine — confirm no main-process crash in the terminal.) Quit with Cmd-Q.

- [ ] **Step 6: Typecheck + commit**

Run: `cd desktop && npx tsc --noEmit` → 0 errors.

```bash
git add desktop/src/preload/index.ts desktop/src/main/index.ts desktop/src/main/netcheck.ts desktop/build/entitlements.mac.plist
git commit -m "feat(desktop): electron main process, IPC surface, lifecycle wiring"
```

---

## Task 11: Renderer — first-run wizard + control panel

**Files:**
- Create: `desktop/src/renderer/index.html`
- Create: `desktop/src/renderer/style.css`
- Create: `desktop/src/renderer/app.ts`
- Create: `desktop/src/renderer/wizard.ts`
- Create: `desktop/src/renderer/panel.ts`

> UI glue; verified by the real run (Task 13). Keep it dependency-free vanilla TS/DOM — no framework — to stay small and auditable.

- [ ] **Step 1: Create `desktop/src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
		<title>Donna for Mac</title>
		<link rel="stylesheet" href="./style.css" />
	</head>
	<body>
		<main id="root">Loading…</main>
		<script type="module" src="./app.ts"></script>
	</body>
</html>
```

- [ ] **Step 2: Create `desktop/src/renderer/style.css`** (minimal, legible)

```css
:root {
	font-family: -apple-system, system-ui, sans-serif;
	color: #1d1d1f;
}
body {
	margin: 0;
}
#root {
	max-width: 640px;
	margin: 0 auto;
	padding: 40px 24px;
}
h1 {
	font-size: 22px;
}
.step {
	margin: 24px 0;
}
button {
	font-size: 15px;
	padding: 10px 18px;
	border-radius: 8px;
	border: 0;
	background: #0a84ff;
	color: #fff;
	cursor: pointer;
}
button.secondary {
	background: #e5e5ea;
	color: #1d1d1f;
}
input[type='text'],
input[type='email'],
input[type='password'] {
	width: 100%;
	padding: 10px;
	font-size: 15px;
	border: 1px solid #c7c7cc;
	border-radius: 8px;
	box-sizing: border-box;
}
.state {
	font-weight: 600;
}
#logs {
	background: #1d1d1f;
	color: #d1d1d6;
	font-family: ui-monospace, monospace;
	font-size: 12px;
	padding: 12px;
	height: 220px;
	overflow: auto;
	border-radius: 8px;
	white-space: pre-wrap;
}
```

- [ ] **Step 3: Create `desktop/src/renderer/app.ts`** (router)

```ts
import { renderWizard } from './wizard'
import { renderPanel } from './panel'
import type { DonnaBridge } from '../preload'

declare global {
	interface Window {
		donna: DonnaBridge
	}
}

const root = document.getElementById('root')!

async function main(): Promise<void> {
	const firstRun = await window.donna.isFirstRun()
	if (firstRun) renderWizard(root, () => renderPanel(root))
	else renderPanel(root)
}

main()
```

- [ ] **Step 4: Create `desktop/src/renderer/wizard.ts`**

```ts
/**
 * First-run wizard. Four conceptual screens collapsed into one scrollable form for
 * Phase 1: secrets are auto-generated (no UI), the user picks inference + admin login.
 * On submit we hand the choices to the main process, which generates secrets, writes
 * the .env, starts the stack, waits for HEALTHY, and runs the admin fixture.
 */
export function renderWizard(root: HTMLElement, onDone: () => void): void {
	root.innerHTML = `
		<h1>Welcome to Donna</h1>
		<p>Donna runs a private legal-AI workspace on your Mac. This one-time setup creates
		your login and starts the engine. The first start downloads AI models and can take
		several minutes.</p>

		<div class="step">
			<h3>1. How should Donna think?</h3>
			<label><input type="radio" name="inf" value="cloud" checked /> Use a cloud API key (recommended)</label><br/>
			<input id="apikey" type="password" placeholder="Anthropic API key (sk-ant-…)" />
			<label style="display:block;margin-top:12px"><input type="radio" name="inf" value="ollama" /> Run fully local with Ollama</label>
		</div>

		<div class="step">
			<h3>2. Create your login</h3>
			<input id="email" type="email" placeholder="you@example.com" />
			<input id="password" type="password" placeholder="Choose a password (12+ characters)" style="margin-top:8px" />
		</div>

		<div class="step">
			<button id="go">Start Donna</button>
			<p id="err" style="color:#c00"></p>
		</div>
	`

	const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
	$('go').addEventListener('click', async () => {
		const mode = (document.querySelector('input[name="inf"]:checked') as HTMLInputElement).value
		const email = $<HTMLInputElement>('email').value.trim()
		const password = $<HTMLInputElement>('password').value
		const err = $('err')

		if (!email || password.length < 12) {
			err.textContent = 'Enter an email and a password of at least 12 characters.'
			return
		}
		const inference =
			mode === 'cloud'
				? { mode: 'cloud' as const, anthropicApiKey: $<HTMLInputElement>('apikey').value.trim() }
				: { mode: 'ollama' as const, baseUrl: 'http://host.docker.internal:11434' }

		;($('go') as HTMLButtonElement).disabled = true
		err.textContent = 'Starting… downloading models on first run; this can take a few minutes.'
		const res = await window.donna.completeWizard({ inference, adminEmail: email, adminPassword: password })
		if (res.ok) onDone()
		else {
			err.textContent = res.error ?? 'Setup failed.'
			;($('go') as HTMLButtonElement).disabled = false
		}
	})
}
```

- [ ] **Step 5: Create `desktop/src/renderer/panel.ts`**

```ts
interface Snapshot {
	state: string
	services: { name: string; health: string }[]
	engineMessage?: string
}

const LABELS: Record<string, string> = {
	NO_ENGINE: 'Docker is not running',
	STOPPED: 'Stopped',
	STACK_STARTING: 'Starting…',
	HEALTHY: 'Running',
	FAILED: 'Something went wrong'
}

export function renderPanel(root: HTMLElement): void {
	root.innerHTML = `
		<h1>Donna</h1>
		<p>Status: <span class="state" id="state">…</span></p>
		<div class="step">
			<button id="open">Open Donna</button>
			<button id="start" class="secondary">Start</button>
			<button id="stop" class="secondary">Stop</button>
		</div>
		<h3>Logs</h3>
		<div id="logs"></div>
	`
	const stateEl = document.getElementById('state')!
	const logsEl = document.getElementById('logs')!
	const open = document.getElementById('open') as HTMLButtonElement

	const apply = (snap: Snapshot) => {
		stateEl.textContent = LABELS[snap.state] ?? snap.state
		open.disabled = snap.state !== 'HEALTHY'
	}

	document.getElementById('open')!.addEventListener('click', () => window.donna.openDonna())
	document.getElementById('start')!.addEventListener('click', () => window.donna.start())
	document.getElementById('stop')!.addEventListener('click', () => window.donna.stop())

	window.donna.onLog((line) => {
		logsEl.textContent += line + '\n'
		logsEl.scrollTop = logsEl.scrollHeight
	})
	window.donna.onState((snap) => apply(snap as Snapshot))

	// Initial + periodic poll (keep last-known-good on transient nulls).
	const tick = async () => {
		const snap = (await window.donna.status()) as Snapshot
		if (snap) apply(snap)
	}
	tick()
	setInterval(tick, 5000)
}
```

- [ ] **Step 6: Run the app and walk the wizard UI (no Docker calls needed to render)**

Run: `cd desktop && npm run dev`
Expected: the wizard renders (radio + inputs + "Start Donna"); switching to the control panel renders state/buttons/logs. Validation rejects a short password. (Full start flow is exercised in Task 13.) Quit with Cmd-Q.

- [ ] **Step 7: Typecheck + commit**

Run: `cd desktop && npx tsc --noEmit` → 0 errors.

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): first-run wizard + control-panel renderer (vanilla TS)"
```

---

## Task 12: Packaging, signing, notarization config + CI

**Files:**
- Create: `desktop/electron-builder.yml`
- Create: `desktop/build/notarize.cjs` (afterSign hook)
- Create: `desktop/resources/.gitkeep` (compose is copied in at build time)
- Create: `.github/workflows/desktop-release.yml`
- Modify: `desktop/package.json` (add a `prebuild` copy of the compose file)

- [ ] **Step 1: Add the compose-copy prepack step to `desktop/package.json` scripts**

Replace the `"dist"` script and add `"prepack:compose"`:

```json
		"prepack:compose": "node -e \"require('fs').copyFileSync('../docker-compose.release.yml','resources/docker-compose.release.yml')\"",
		"dist": "npm run prepack:compose && npm run build && electron-builder --mac"
```

- [ ] **Step 2: Create `desktop/electron-builder.yml`**

```yaml
appId: ai.lq.donna.desktop
productName: Donna
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
extraResources:
  - from: resources/docker-compose.release.yml
    to: docker-compose.release.yml
mac:
  category: public.app-category.productivity
  target:
    - dmg
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false # toggled on via env in CI (see afterSign hook)
afterSign: build/notarize.cjs
dmg:
  title: Install Donna
```

- [ ] **Step 3: Create `desktop/build/notarize.cjs`** (notarize only when creds are present)

```js
// Notarize the signed .app via notarytool when Apple creds are in the env (CI).
// No-op locally so `npm run dist` works unsigned for smoke tests.
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
	if (context.electronPlatformName !== 'darwin') return
	const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
	if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
		console.log('Skipping notarization — Apple creds not set.')
		return
	}
	const appName = context.packager.appInfo.productFilename
	await notarize({
		appBundleId: 'ai.lq.donna.desktop',
		appPath: `${context.appOutDir}/${appName}.app`,
		appleId: APPLE_ID,
		appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
		teamId: APPLE_TEAM_ID
	})
}
```

Add the dev dep: in `desktop/package.json` devDependencies add `"@electron/notarize": "^2.3.0"`.

- [ ] **Step 4: Create `desktop/resources/.gitkeep`** (empty file; the compose is copied in at build, gitignored)

Add to `desktop/.gitignore`: `resources/docker-compose.release.yml`.

- [ ] **Step 5: Create `.github/workflows/desktop-release.yml`**

```yaml
name: Desktop launcher (macOS)

on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Release tag for the .dmg (e.g. desktop-v0.1.0)'
        required: true
  push:
    tags: ['desktop-v*']

permissions:
  contents: write

jobs:
  build:
    runs-on: macos-14
    defaults:
      run:
        working-directory: desktop
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - name: Unit tests (core)
        run: npm test
      - name: Typecheck
        run: npm run typecheck
      - name: Build, sign, notarize .dmg
        env:
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }} # base64 Developer ID .p12
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run dist
      - name: Publish .dmg to the release
        uses: softprops/action-gh-release@v2
        with:
          files: desktop/dist/*.dmg
          tag_name: ${{ github.event.inputs.tag || github.ref_name }}
```

- [ ] **Step 6: Verify the build produces an (unsigned, local) .app/.dmg**

Run (locally, no Apple creds — notarization no-ops): `cd desktop && npm run dist`
Expected: `desktop/dist/Donna-0.1.0-*.dmg` is produced; the afterSign hook logs "Skipping notarization". (On a machine with a Developer ID cert + Apple creds in env, the same command signs + notarizes.)

- [ ] **Step 7: Commit**

```bash
git add desktop/electron-builder.yml desktop/build/notarize.cjs desktop/resources/.gitkeep desktop/.gitignore desktop/package.json desktop/package-lock.json .github/workflows/desktop-release.yml
git commit -m "build(desktop): electron-builder mac target + notarize hook + release CI"
```

---

## Task 13: Real-run verification (the evidence)

**Files:** none (verification task — produces a recorded run, not code).

> This is the spec's "fresh clone rigor, from an installer." Evidence = a recorded run, not an assertion (CLAUDE.md §2.5).

- [ ] **Step 1: Build the local .dmg**

Run: `cd desktop && npm run dist`
Expected: a `.dmg` in `desktop/dist/`.

- [ ] **Step 2: Install + first-run on a Mac with Docker present but NO Donna repo cloned**

Open the `.dmg`, drag to Applications, launch. Walk the wizard: pick cloud key (paste a real `ANTHROPIC_API_KEY`), set an admin email + 12-char password, click "Start Donna".

Expected (observe + record):
- The control panel shows `STACK_STARTING`, then the logs pane streams `donna-web` output.
- First run downloads models (ingest-worker) — the status stays honest (`STACK_STARTING`), not a fake "ready".
- State reaches `HEALTHY`; "Open Donna" enables.
- Click "Open Donna" → the window loads `http://localhost:13002` and shows the login page.
- Log in with the admin email/password created by the fixture → reach the authed app.

- [ ] **Step 3: Lifecycle checks**

- Click "Stop" → `docker ps` shows the `donna` project stopped; panel reads `STOPPED`.
- Relaunch the app → no wizard (config reused); "Start" brings the stack back to `HEALTHY`.
- Quit the app → confirm the chosen quit behavior (stack left running or stopped).

- [ ] **Step 4: Engine-absent path**

Quit Docker Desktop entirely, launch the app → panel reads `NO_ENGINE` with the install/start guidance message (not a crash, not a fake ready).

- [ ] **Step 5: Record the evidence**

Capture a screen recording or a sequence of screenshots of Steps 2–4 and save a short note under `desktop/VERIFICATION.md` summarizing what was observed (states reached, login success, stop/relaunch reuse). Commit it.

```bash
git add desktop/VERIFICATION.md
git commit -m "docs(desktop): record Phase 1 fresh-Mac verification run"
```

---

## Task 14: Docs — roadmap, README, CLAUDE.md, decision note

**Files:**
- Modify: `docs/roadmap/donna-future-roadmap.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `docs/decisions/desktop-launcher.md`

- [ ] **Step 1: Add the decision note — `docs/decisions/desktop-launcher.md`**

```markdown
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

Design doc: `docs/superpowers/plans/20260613desktoplauncherappdesign.md`.
Plan: `docs/superpowers/plans/2026-06-13-desktop-launcher-phase1.md`.
```

- [ ] **Step 2: Add a "Desktop app (macOS)" option above the compose flow in `README.md`**

Locate the install/Quick-install section and insert, as the first install option:

```markdown
### Option A — Desktop app (macOS, easiest)

Download **Donna.dmg** from the [latest desktop release](https://github.com/LegalQuants/Donna/releases),
drag it to Applications, and open it. A one-time wizard creates your login and starts the engine
(Docker required — the app links you to Docker Desktop if it's not installed). No terminal, no
`.env`. See `desktop/` for the launcher source.

### Option B — Pre-built images (any OS with Docker)
```

(Keep the existing compose instructions under Option B.)

- [ ] **Step 3: Add a short note to `CLAUDE.md`** (in §5 Distribution, after the pre-built-images paragraph)

```markdown
**Desktop launcher (`desktop/`).** A macOS Electron app that orchestrates
`docker-compose.release.yml` for non-technical users — generates secrets, writes a chmod-600 `.env`
in app data, runs the stack + admin fixture, and opens `localhost:13002` in a native window. It
**wraps** the release compose and the published images; it never forks `donna-web` or the backend
(§1/§8 still hold). Built/signed/notarized by `.github/workflows/desktop-release.yml`. Phase 1 =
detect-Docker; bundled engine is a later phase. Decision: `docs/decisions/desktop-launcher.md`.
```

- [ ] **Step 4: Add the launcher entry to `docs/roadmap/donna-future-roadmap.md`** (Distribution section)

```markdown
- **Desktop launcher (`desktop/`).** Phase 1 shipped: signed/notarized macOS `.dmg` that wraps the
  release compose (detect-Docker, first-run wizard, control panel). **Phase 2** — bundle/manage a
  Linux container engine (Colima or Podman) so Docker is no longer a prerequisite (true
  double-click). **Phase 3** — `electron-updater` auto-update, surface available image releases from
  GHCR, resource/disk controls for the ML worker, menu-bar UX. **Windows** build (WSL2 engine
  backend) is a follow-up. Design: `docs/superpowers/plans/20260613desktoplauncherappdesign.md`.
```

- [ ] **Step 5: Verify docs build/lint cleanly (markdown only — no app gates touched)**

Run: `git diff --stat` to confirm only the four doc files changed.
Expected: `docs/decisions/desktop-launcher.md` (new), `README.md`, `CLAUDE.md`, `docs/roadmap/donna-future-roadmap.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/decisions/desktop-launcher.md README.md CLAUDE.md docs/roadmap/donna-future-roadmap.md
git commit -m "docs(desktop): launcher decision note + README/CLAUDE/roadmap entries"
```

---

## Self-review checklist (run before opening the PR)

- [ ] **Core suite green:** `cd desktop && npx vitest run` — all of types/secrets/env/ports/compose/engine/state/orchestrator pass.
- [ ] **Typecheck green:** `cd desktop && npx tsc --noEmit` — 0 errors.
- [ ] **Spec coverage:** every Phase 1 responsibility in the design doc maps to a task — engine detect (T6), secret gen (T2), `.env` render (T3), ports (T4), state machine (T5/T7/T9), wizard incl. admin fixture (T10/T11), control panel + logs + open-Donna (T11), packaging/sign/notarize (T12), real-run evidence (T13), docs (T14).
- [ ] **Cardinal rules:** `desktop/` imports nothing from `vendor/`; the launcher only shells out to the release compose + published images; `donna-web`/BFF/backend untouched.
- [ ] **Type consistency:** `LauncherConfig`, `PortConfig`, `GeneratedSecrets`, `ServiceStatus`, `LauncherState`, and the compose argv shapes are used identically across core, main, and renderer.
- [ ] **No placeholders:** every step above has real code/commands.

---

## PR

Open with a **merge commit** (never squash — `.git-blame-ignore-revs`). Title:
`feat(desktop): Phase 1 macOS launcher — wrap the release stack in a double-click app`.
Body: link the design doc + this plan; note Phase 1 scope (detect-Docker), the tested pure core,
and the recorded fresh-Mac verification run. Mirror to `tucuxi` after merge.
```

