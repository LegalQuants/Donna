// src/lib/automations/display.test.ts
import { describe, it, expect } from 'vitest';
import { formatUsd, formatWhen, statusTone, terminalReasonLabel, outcomeTone } from './display';

describe('display helpers', () => {
  it('outcomeTone maps started/success/other to distinct classes', () => {
    expect(outcomeTone('success')).toContain('emerald');
    expect(outcomeTone('started')).toContain('muted');
    expect(outcomeTone('error')).toContain('amber');
  });
  it('formatUsd renders dollars or a dash', () => {
    expect(formatUsd(0.42)).toBe('$0.42');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(null)).toBe('—');
  });
  it('formatWhen renders a locale string or a dash', () => {
    expect(formatWhen(null)).toBe('—');
    expect(formatWhen('2026-06-04T09:00:00Z')).toBe(new Date('2026-06-04T09:00:00Z').toLocaleString());
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
});
