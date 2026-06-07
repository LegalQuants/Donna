import { describe, it, expect } from 'vitest';
import { formatBytes, statusBadge } from './uploadFile';

describe('formatBytes', () => {
	it('renders 0 B', () => {
		expect(formatBytes(0)).toBe('0 B');
	});
	it('renders raw bytes under 1 KB', () => {
		expect(formatBytes(512)).toBe('512 B');
	});
	it('renders KB with one decimal for kilobytes', () => {
		expect(formatBytes(1536)).toBe('1.5 KB');
	});
	it('renders MB with one decimal for megabytes', () => {
		expect(formatBytes(2 * 1024 * 1024 + 512 * 1024)).toBe('2.5 MB');
	});
	it('rounds KB down to whole numbers when no fractional part', () => {
		expect(formatBytes(2048)).toBe('2 KB');
	});
});

describe('statusBadge', () => {
	it('maps "ready" to a success-toned badge', () => {
		expect(statusBadge('ready')).toEqual({ label: 'Ready', tone: 'success' });
	});
	it('maps "pending" to a muted badge', () => {
		expect(statusBadge('pending')).toEqual({ label: 'Pending', tone: 'muted' });
	});
	it('maps "processing" to a muted badge', () => {
		expect(statusBadge('processing')).toEqual({ label: 'Processing', tone: 'muted' });
	});
	it('maps "failed" to an error-toned badge', () => {
		expect(statusBadge('failed')).toEqual({ label: 'Failed', tone: 'error' });
	});
	it('maps undefined/null to a muted "Pending" badge (defensive default)', () => {
		expect(statusBadge(undefined)).toEqual({ label: 'Pending', tone: 'muted' });
	});
});
