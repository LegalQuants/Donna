import { EXPECTED_SERVICES } from './types';

const TOTAL = EXPECTED_SERVICES.length;

/**
 * User-facing status shown in the first-run wizard while the stack comes up. Pure + total
 * so it can be unit-tested and the renderer just displays the string.
 *
 * After the user clicks Start, `STOPPED` means the engine images are still downloading
 * (no containers created yet) — the longest first-run phase (~10 GB), which otherwise sat
 * on a static "Starting Donna…" and looked frozen, prompting users to retry. The copy now
 * sets the "this is slow and may look idle" expectation. Once containers exist the state
 * becomes `STACK_STARTING` and we surface live N/8 progress.
 */
export function startupMessage(state: string, healthyCount = 0): string {
	switch (state) {
		case 'STOPPED':
			return 'Downloading the engine on first run (~10 GB). This is a one-time step and can take 10+ minutes — it may look idle, so please keep this window open.';
		case 'STACK_STARTING':
			return `Starting Donna… ${healthyCount}/${TOTAL} services ready (first run also downloads AI models; this can take a few minutes).`;
		default:
			return 'Starting Donna…';
	}
}
