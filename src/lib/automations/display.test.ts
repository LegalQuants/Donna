// src/lib/automations/display.test.ts
import { describe, it, expect } from 'vitest';
import {
	formatUsd,
	formatWhen,
	statusTone,
	terminalReasonLabel,
	outcomeTone,
	stateChipClass,
	formatBytes
} from './display';

describe('display helpers', () => {
	it('outcomeTone maps started/success/other to distinct classes', () => {
		expect(outcomeTone('success')).toContain('mlq-success');
		expect(outcomeTone('started')).toContain('mlq-muted');
		expect(outcomeTone('error')).toContain('mlq-caveats');
	});
	it('formatUsd renders dollars or a dash', () => {
		expect(formatUsd(0.42)).toBe('$0.42');
		expect(formatUsd(0)).toBe('$0.00');
		expect(formatUsd(null)).toBe('—');
	});
	it('formatWhen renders a locale string or a dash', () => {
		expect(formatWhen(null)).toBe('—');
		expect(formatWhen('2026-06-04T09:00:00Z')).toBe(
			new Date('2026-06-04T09:00:00Z').toLocaleString()
		);
	});
	it('statusTone maps each status to a non-empty class string', () => {
		for (const s of ['running', 'completed', 'halted', 'failed', 'anything']) {
			expect(statusTone(s).length).toBeGreaterThan(0);
		}
	});
	it('terminalReasonLabel humanizes known reasons and passes through null', () => {
		expect(terminalReasonLabel('cost_cap_reached')).toBe('Cost cap reached');
		expect(terminalReasonLabel('external_halt')).toBe('Halted');
		expect(terminalReasonLabel(null)).toBe('In progress');
	});
	it('stateChipClass returns workflow class for proposed and neutral class for unknown', () => {
		expect(stateChipClass('proposed')).toContain('mlq-workflow');
		expect(stateChipClass('unknown-state')).toContain('mlq-muted');
	});
});

describe('formatBytes', () => {
	it('formats bytes, KB, and MB at sensible precision', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(842)).toBe('842 B');
		expect(formatBytes(1024)).toBe('1.0 KB');
		expect(formatBytes(4608)).toBe('4.5 KB');
		expect(formatBytes(1048576)).toBe('1.0 MB');
		expect(formatBytes(2621440)).toBe('2.5 MB');
	});
	it('tolerates negative/non-finite input with an em dash', () => {
		expect(formatBytes(-1)).toBe('—');
		expect(formatBytes(Number.NaN)).toBe('—');
	});
});
