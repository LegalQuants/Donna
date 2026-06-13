import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { composeBaseArgs, logsArgs } from '../core/compose'
import { resolvePorts } from '../core/ports'
import { generateSecrets } from '../core/secrets'
import { DEFAULT_PORTS } from '../core/types'
import type { InferenceChoice, LauncherConfig } from '../core/config'
import { loadConfig, saveConfig, writeEnvFile } from './store'
import { composeFilePath, envPath, PROJECT_NAME } from './paths'
import { snapshot, startStack, stopStack, runAdminFixture, type StackSnapshot } from './orchestrator'
import { streamDocker } from './runner'
import { isPortFreeSync } from './netcheck'

let win: BrowserWindow | null = null

/** Compose base args, including the app-data --env-file so the generated .env is used. */
const base = (): string[] => [...composeBaseArgs(composeFilePath(), PROJECT_NAME), '--env-file', envPath()]

interface WizardInput {
	inference: InferenceChoice
	adminEmail: string
	adminPassword: string
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
	})
	if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
	else win.loadFile(join(__dirname, '../renderer/index.html'))
}

async function waitHealthy(b: string[], timeoutMs = 600_000): Promise<void> {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		const snap: StackSnapshot = await snapshot(b)
		win?.webContents.send('stack:state', snap)
		if (snap.state === 'HEALTHY') return
		if (snap.state === 'FAILED') throw new Error('Stack failed to start; see logs.')
		if (snap.state === 'NO_ENGINE')
			throw new Error(snap.engineMessage ?? "Docker isn't running. Start Docker Desktop and try again.")
		await new Promise((r) => setTimeout(r, 4000))
	}
	throw new Error('Timed out waiting for the stack to become healthy.')
}

ipcMain.handle('config:isFirstRun', () => loadConfig() === null)

ipcMain.handle('wizard:complete', async (_e, input: WizardInput) => {
	try {
		if (
			typeof input?.adminEmail !== 'string' ||
			typeof input?.adminPassword !== 'string' ||
			!input?.inference
		) {
			return { ok: false, error: 'Invalid setup input.' }
		}
		const cfg: LauncherConfig = {
			secrets: generateSecrets(),
			ports: resolvePorts(DEFAULT_PORTS, isPortFreeSync),
			imageTag: 'v0.1.0',
			inference: input.inference,
			adminEmail: input.adminEmail
		}
		saveConfig(cfg)
		writeEnvFile(cfg)
		const b = base()
		await startStack(b, process.env)
		await waitHealthy(b)
		await runAdminFixture(b, input.adminEmail, input.adminPassword)
		return { ok: true }
	} catch (err) {
		return { ok: false, error: String(err) }
	}
})

ipcMain.handle('stack:status', () => snapshot(base()))
ipcMain.handle('stack:start', () => startStack(base(), process.env))
ipcMain.handle('stack:stop', () => stopStack(base()))
ipcMain.handle('stack:openDonna', () => {
	const cfg = loadConfig()
	const port = cfg?.ports.donnaWeb ?? DEFAULT_PORTS.donnaWeb
	win?.loadURL(`http://localhost:${port}`)
})
ipcMain.handle('engine:installDocker', () =>
	shell.openExternal('https://www.docker.com/products/docker-desktop/')
)

app.whenReady().then(() => {
	createWindow()
	// Tail donna-web logs into the renderer (best-effort; ignored before the stack exists).
	const stopLogTail = streamDocker(logsArgs(base(), 'donna-web'), (line) =>
		win?.webContents.send('stack:log', line)
	)
	app.on('before-quit', stopLogTail)
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
