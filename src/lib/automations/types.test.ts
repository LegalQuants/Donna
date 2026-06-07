// src/lib/automations/types.test.ts
import { describe, it, expect } from 'vitest';
import {
	parseReceipt,
	parseSessionSummary,
	parseSessionList,
	parseNotification,
	parseNotificationList
} from './types';

describe('parseReceipt', () => {
	it('parses a full receipt and coerces Decimal-string costs to numbers', () => {
		const r = parseReceipt({
			session_id: 's1',
			trigger_kind: 'schedule',
			status: 'completed',
			halt_state: 'running',
			current_phase: 'delivery',
			cost_total_usd: '0.42',
			max_cost_usd: '2.00',
			cost_cap_reached: false,
			created_at: '2026-06-04T09:00:00Z',
			completed_at: '2026-06-04T09:04:00Z',
			phase_transitions: [{ to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' }],
			tool_calls: [
				{ tool: 'kb.search', outcome: 'ok', timestamp: '2026-06-04T09:01:00Z', cost_usd: 0.01 }
			],
			terminal_reason: 'completed'
		});
		expect(r).not.toBeNull();
		expect(r!.cost_total_usd).toBe(0.42);
		expect(r!.max_cost_usd).toBe(2);
		expect(r!.phase_transitions[0].to_phase).toBe('intake');
		expect(r!.tool_calls[0].cost_usd).toBe(0.01);
		expect(r!.terminal_reason).toBe('completed');
	});

	it('returns null when the receipt is absent (build_receipt_safe → None)', () => {
		expect(parseReceipt(null)).toBeNull();
		expect(parseReceipt({})).toBeNull(); // no session_id
	});

	it('defaults missing arrays and tolerates sparse/garbage entries', () => {
		const r = parseReceipt({ session_id: 's2', trigger_kind: 'manual' });
		expect(r!.phase_transitions).toEqual([]);
		expect(r!.tool_calls).toEqual([]);
		expect(r!.cost_total_usd).toBeNull();
		const r2 = parseReceipt({ session_id: 's3', tool_calls: [null, { tool: 'x' }, 7] });
		expect(r2!.tool_calls).toHaveLength(3);
		expect(r2!.tool_calls[0].tool).toBeNull();
		expect(r2!.tool_calls[1].tool).toBe('x');
		expect(r2!.tool_calls[1].cost_usd).toBeNull();
	});
});

describe('parseSessionSummary / parseSessionList', () => {
	it('returns null for non-objects and rows without an id', () => {
		expect(parseSessionSummary(null)).toBeNull();
		expect(parseSessionSummary({})).toBeNull();
		expect(parseSessionSummary({ id: 'a' })?.status).toBe('running'); // defaults applied
	});
	it('parses a list envelope and drops rows without an id', () => {
		const list = parseSessionList({
			sessions: [
				{
					id: 'a',
					trigger_kind: 'manual',
					current_phase: 'intake',
					status: 'running',
					halt_state: 'running',
					cost_total_usd: '0',
					cost_cap_reached: false,
					created_at: 'x'
				},
				{ trigger_kind: 'manual' }
			],
			total_count: 2,
			limit: 50,
			offset: 0
		});
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe('a');
		expect(list[0].cost_total_usd).toBe(0);
	});
	it('accepts a bare array too', () => {
		expect(parseSessionList([{ id: 'z' }])).toHaveLength(1);
	});
});

describe('parseNotification / parseNotificationList', () => {
	it('parses a notification with a typed session_id', () => {
		const n = parseNotification({
			id: 'n1',
			session_id: 's1',
			channel: 'in_app',
			title: 'Done',
			body: 'Review ready',
			read_at: null,
			created_at: '2026-06-04T09:04:00Z'
		});
		expect(n!.session_id).toBe('s1');
		expect(n!.read_at).toBeNull();
	});
	it('parses the list envelope and drops rows missing id/session_id', () => {
		const list = parseNotificationList({
			notifications: [
				{ id: 'n1', session_id: 's1', channel: 'in_app', title: 't', body: 'b', created_at: 'x' },
				{ id: 'n2' }
			],
			total_count: 2,
			limit: 50,
			offset: 0
		});
		expect(list).toHaveLength(1);
	});
});
