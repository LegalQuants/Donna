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

	const apply = (snap: Snapshot): void => {
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

	const tick = async (): Promise<void> => {
		const snap = (await window.donna.status()) as Snapshot
		if (snap) apply(snap)
	}
	tick()
	setInterval(tick, 5000)
}
