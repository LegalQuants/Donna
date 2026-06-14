/**
 * First-run wizard. Secrets are auto-generated (no UI); the user picks inference + sets a
 * password. The backend ships a fixed bootstrap admin (admin@lq.ai) and only a
 * reset-admin-password command (no create-user), so the login email is admin@lq.ai — the
 * user can change it later in the app's Settings. The API key is OPTIONAL (login/chat work
 * without it; keys can also be set later in Settings).
 */
const ADMIN_EMAIL = 'admin@lq.ai'

interface Snapshot {
	state: string
	services?: { health: string }[]
}

export function renderWizard(root: HTMLElement, onDone: () => void): void {
	root.innerHTML = `
		<h1>Welcome to Donna</h1>
		<p>Donna runs a private legal-AI workspace on your Mac. This one-time setup sets your
		password and starts the engine. The first start downloads AI models and can take
		several minutes.</p>

		<div class="step">
			<h3>1. How should Donna think?</h3>
			<label><input type="radio" name="inf" value="cloud" checked /> Use a cloud API key (recommended)</label><br/>
			<input id="apikey" type="password" placeholder="Anthropic API key (optional — you can add it later)" />
			<label style="display:block;margin-top:12px"><input type="radio" name="inf" value="ollama" /> Run fully local with Ollama</label>
		</div>

		<div class="step">
			<h3>2. Set your password</h3>
			<p style="margin:4px 0 8px; color:#555">Your login is <strong>${ADMIN_EMAIL}</strong> — you can change it later in Settings → Account.</p>
			<input id="password" type="password" placeholder="Choose a password (12+ characters)" />
		</div>

		<div class="step">
			<button id="go">Start Donna</button>
			<p id="status"></p>
		</div>
	`

	const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
	const status = $('status')

	// Live progress while the stack comes up (replaces a static, misleading message).
	window.donna.onState((snap) => {
		const s = snap as Snapshot
		if (s.state === 'STACK_STARTING') {
			const healthy = (s.services ?? []).filter((x) => x.health === 'healthy').length
			status.style.color = '#555'
			status.textContent = `Starting Donna… ${healthy}/8 services ready (first run pulls images + models; this can take a few minutes).`
		} else if (s.state === 'NO_ENGINE') {
			status.style.color = '#c00'
			status.textContent = "Docker isn't running — start Docker Desktop and try again."
		}
	})

	$('go').addEventListener('click', async () => {
		const mode = (document.querySelector('input[name="inf"]:checked') as HTMLInputElement).value
		const password = $<HTMLInputElement>('password').value

		if (password.length < 12) {
			status.style.color = '#c00'
			status.textContent = 'Choose a password of at least 12 characters.'
			return
		}
		const inference =
			mode === 'cloud'
				? { mode: 'cloud' as const, anthropicApiKey: $<HTMLInputElement>('apikey').value.trim() }
				: { mode: 'ollama' as const, baseUrl: 'http://host.docker.internal:11434' }

		const goBtn = $<HTMLButtonElement>('go')
		goBtn.disabled = true
		status.style.color = '#555'
		status.textContent = 'Starting Donna…'
		const res = await window.donna.completeWizard({
			inference,
			adminEmail: ADMIN_EMAIL,
			adminPassword: password
		})
		if (res.ok) onDone()
		else {
			status.style.color = '#c00'
			status.textContent = res.error ?? 'Setup failed.'
			goBtn.disabled = false
		}
	})
}
