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

// Distinct from the build-from-source / raw-lq-ai dev stacks (which use project "donna")
// so the launcher gets its OWN isolated volumes and never collides on volumes/ports.
// `-p` overrides the compose file's top-level `name:`.
export const PROJECT_NAME = 'donna-desktop'
