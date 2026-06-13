/**
 * First-run wizard. Secrets are auto-generated (no UI); the user picks inference + admin
 * login. On submit the main process generates secrets, writes the .env, starts the stack,
 * waits for HEALTHY, and runs the admin fixture. The API key is OPTIONAL — login and chat
 * creation work without it, and keys can also be set later in the app's Settings (BYOK);
 * the field just seeds the gateway for the simplest first run.
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
			<input id="apikey" type="password" placeholder="Anthropic API key (optional — you can add it later)" />
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

	const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
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

		const goBtn = $<HTMLButtonElement>('go')
		goBtn.disabled = true
		err.textContent = 'Starting… downloading models on first run; this can take a few minutes.'
		const res = await window.donna.completeWizard({ inference, adminEmail: email, adminPassword: password })
		if (res.ok) onDone()
		else {
			err.textContent = res.error ?? 'Setup failed.'
			goBtn.disabled = false
		}
	})
}
