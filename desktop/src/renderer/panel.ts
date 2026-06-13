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
		<p id="msg" style="color:#c00"></p>
		<div class="step">
			<button id="open">Open Donna</button>
			<button id="start" class="secondary">Start</button>
			<button id="stop" class="secondary">Stop</button>
			<button id="install" class="secondary" style="display:none">Install Docker Desktop</button>
		</div>
		<h3>Logs</h3>
		<div id="logs"></div>
	`
	const stateEl = document.getElementById('state')!
	const logsEl = document.getElementById('logs')!
	const open = document.getElementById('open') as HTMLButtonElement
	const msgEl = document.getElementById('msg')!
	const install = document.getElementById('install') as HTMLButtonElement

	const apply = (snap: Snapshot): void => {
		stateEl.textContent = LABELS[snap.state] ?? snap.state
		open.disabled = snap.state !== 'HEALTHY'
		const noEngine = snap.state === 'NO_ENGINE'
		msgEl.textContent = noEngine ? (snap.engineMessage ?? '') : ''
		install.style.display = noEngine ? 'inline-block' : 'none'
	}

	document.getElementById('open')!.addEventListener('click', () => window.donna.openDonna())
	document.getElementById('start')!.addEventListener('click', () => window.donna.start())
	document.getElementById('stop')!.addEventListener('click', () => window.donna.stop())
	install.addEventListener('click', () => window.donna.installDocker())

	const MAX_LOG_LINES = 2000
	window.donna.onLog((line) => {
		const lines = (logsEl.textContent + line + '\n').split('\n')
		if (lines.length > MAX_LOG_LINES) lines.splice(0, lines.length - MAX_LOG_LINES)
		logsEl.textContent = lines.join('\n')
		logsEl.scrollTop = logsEl.scrollHeight
	})
	window.donna.onState((snap) => apply(snap as Snapshot))

	const tick = async (): Promise<void> => {
		const snap = (await window.donna.status()) as Snapshot
		if (snap) apply(snap)
	}
	tick()
	setInterval(tick, 5000)
}
