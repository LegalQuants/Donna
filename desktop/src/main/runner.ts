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
