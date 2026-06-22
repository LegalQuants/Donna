import { describe, it, expect } from 'vitest';
import { startupMessage } from './startup';

describe('startupMessage', () => {
	it('explains the long first-run image download for STOPPED (no containers yet)', () => {
		const msg = startupMessage('STOPPED');
		// Must set the "this is slow and may look idle" expectation so a first-run user
		// does not assume it is frozen and retry.
		expect(msg).toMatch(/download/i);
		expect(msg).toMatch(/first run/i);
		expect(msg).toMatch(/idle|wait|keep this window/i);
	});

	it('shows live N/8 progress while the stack is coming up', () => {
		expect(startupMessage('STACK_STARTING', 3)).toBe(
			'Starting Donna… 3/8 services ready (first run also downloads AI models; this can take a few minutes).'
		);
		expect(startupMessage('STACK_STARTING', 0)).toMatch(/0\/8 services ready/);
		expect(startupMessage('STACK_STARTING', 8)).toMatch(/8\/8 services ready/);
	});

	it('defaults the healthy count to 0 when omitted', () => {
		expect(startupMessage('STACK_STARTING')).toMatch(/0\/8/);
	});

	it('falls back to a generic starting message for any other state', () => {
		expect(startupMessage('HEALTHY')).toBe('Starting Donna…');
		expect(startupMessage('whatever')).toBe('Starting Donna…');
	});
});
