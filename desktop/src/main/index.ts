import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { composeBaseArgs, logsArgs } from '../core/compose';
import { resolvePorts } from '../core/ports';
import { generateSecrets, ensureMasterKey } from '../core/secrets';
import { DEFAULT_PORTS } from '../core/types';
import type { InferenceChoice, LauncherConfig } from '../core/config';
import { loadConfig, saveConfig, writeEnvFile, clearConfig } from './store';
import { composeFilePath, envPath, PROJECT_NAME } from './paths';
import {
	snapshot,
	startStack,
	stopStack,
	resetStack,
	runAdminFixture,
	type StackSnapshot
} from './orchestrator';
import { streamDocker } from './runner';
import { isPortFreeSync } from './netcheck';

let win: BrowserWindow | null = null;

/** Compose base args, including the app-data --env-file so the generated .env is used. */
const base = (): string[] => [
	...composeBaseArgs(composeFilePath(), PROJECT_NAME),
	'--env-file',
	envPath()
];

interface WizardInput {
	inference: InferenceChoice;
	adminEmail: string;
	adminPassword: string;
	courtlistenerToken?: string;
}

function createWindow(): void {
	win = new BrowserWindow({
		width: 1100,
		height: 760,
		webPreferences: {
			preload: join(__dirname, '../preload/index.mjs'),
			// contextIsolation stays on (Electron default) — the security boundary.
			// sandbox is false because electron-vite emits an ESM preload (.mjs), which
			// sandboxed preloads cannot load. Revisit under a real Electron run (Task 13).
			sandbox: false
		}
	});
	if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
	else win.loadFile(join(__dirname, '../renderer/index.html'));
}

async function waitHealthy(b: string[], timeoutMs = 600_000): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const snap: StackSnapshot = await snapshot(b);
		win?.webContents.send('stack:state', snap);
		if (snap.state === 'HEALTHY') return;
		if (snap.state === 'FAILED') throw new Error('Stack failed to start; see logs.');
		if (snap.state === 'NO_ENGINE')
			throw new Error(
				snap.engineMessage ?? "Docker isn't running. Start Docker Desktop and try again."
			);
		await new Promise((r) => setTimeout(r, 4000));
	}
	throw new Error('Timed out waiting for the stack to become healthy.');
}

ipcMain.handle('config:isFirstRun', () => loadConfig() === null);

ipcMain.handle('wizard:complete', async (_e, input: WizardInput) => {
	try {
		if (
			typeof input?.adminEmail !== 'string' ||
			typeof input?.adminPassword !== 'string' ||
			!input?.inference
		) {
			return { ok: false, error: 'Invalid setup input.' };
		}
		const cfg: LauncherConfig = {
			secrets: generateSecrets(),
			ports: resolvePorts(DEFAULT_PORTS, isPortFreeSync),
			imageTag: 'v0.6.2',
			inference: input.inference,
			adminEmail: input.adminEmail,
			courtlistenerToken: input.courtlistenerToken
		};
		// Write the .env (needed before startStack) but DON'T persist the config blob yet —
		// only mark the wizard complete after the stack is healthy and the admin exists, so a
		// failed first run re-shows the wizard instead of stranding a half-configured install.
		writeEnvFile(cfg);
		const b = base();
		// Clear any orphaned data volumes from a PRIOR failed first run before starting. The
		// wizard only reaches here when config isn't persisted (first run, or a retry after a
		// failure), and each run mints a fresh POSTGRES_PASSWORD/MINIO secret — but Postgres and
		// MinIO only apply those on first init and otherwise reuse the existing volume's old
		// credentials. A leftover `pgdata` from a half-up earlier attempt would therefore reject
		// the new password, leaving `api` permanently unhealthy ("password authentication failed
		// for user lq_ai") with no way out via retry. `down -v` wipes those stale volumes; it's a
		// harmless no-op on a genuine first run and never touches the (separately-cached) images,
		// so it doesn't re-trigger the ~10 GB pull. .env already exists for the --env-file.
		await resetStack(b);
		// `up -d` includes the first-run image pull (~10 GB) and only returns once containers
		// are started. Check its exit code so a genuine failure surfaces immediately instead
		// of falling through to a 10-minute waitHealthy timeout.
		const started = await startStack(b, process.env);
		if (started.code !== 0) {
			throw new Error(
				`Could not start Donna: ${started.stderr.trim() || started.stdout.trim() || 'docker compose up failed'}`
			);
		}
		await waitHealthy(b);
		const admin = await runAdminFixture(b, input.adminEmail, input.adminPassword);
		if (admin.code !== 0) {
			throw new Error(
				`Could not set up the login: ${admin.stderr.trim() || admin.stdout.trim() || 'admin fixture failed'}`
			);
		}
		saveConfig(cfg);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
});

ipcMain.handle('stack:status', () => snapshot(base()));
// Backfill LQ_AI_GATEWAY_MASTER_KEY for installs minted before it existed, so
// in-app research/BYOK key-setting works after an app update — without touching
// the volume-bound secrets. First run (no config) is handled by the wizard.
function migrateEnvForExistingInstall(): void {
	const cfg = loadConfig();
	if (!cfg) return;
	const secrets = ensureMasterKey(cfg.secrets);
	if (secrets === cfg.secrets) return;
	const migrated = { ...cfg, secrets };
	saveConfig(migrated);
	writeEnvFile(migrated);
}
ipcMain.handle('stack:start', () => {
	migrateEnvForExistingInstall();
	return startStack(base(), process.env);
});
ipcMain.handle('stack:stop', () => stopStack(base()));
ipcMain.handle('stack:openDonna', () => {
	const cfg = loadConfig();
	const port = cfg?.ports.donnaWeb ?? DEFAULT_PORTS.donnaWeb;
	win?.loadURL(`http://localhost:${port}`);
});
// Reset: stop the stack, remove its volumes (down -v), and delete the stored config/.env
// so the next launch re-runs the first-run wizard. down -v runs while .env still exists.
ipcMain.handle('stack:reset', async () => {
	try {
		await resetStack(base());
		clearConfig();
		return { ok: true };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
});
ipcMain.handle('engine:installDocker', () =>
	// Direct Apple-Silicon Docker Desktop download (this launcher is arm64-only).
	shell.openExternal('https://desktop.docker.com/mac/main/arm64/Docker.dmg')
);

app.whenReady().then(() => {
	createWindow();
	// Tail donna-web logs into the renderer (best-effort; ignored before the stack exists).
	const stopLogTail = streamDocker(logsArgs(base(), 'donna-web'), (line) =>
		win?.webContents.send('stack:log', line)
	);
	app.on('before-quit', stopLogTail);
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
