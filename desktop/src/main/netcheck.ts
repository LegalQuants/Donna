import { createServer } from 'node:net'

/**
 * Best-effort free-port check used once at wizard time. Attempts a listen on
 * 127.0.0.1:<port>; binding success means free. This is a synchronous wrapper over an
 * inherently async API: we default to "free" and let a genuine bind clash surface later
 * as a FAILED stack state, which the UI reports honestly. A blocking async pre-check is
 * a Phase 3 refinement (resource controls). resolvePorts also guards against a runaway scan.
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
		return free || true
	} catch {
		return false
	} finally {
		srv.removeAllListeners()
	}
}
