import { describe, it, expect } from 'vitest';
import { canAudit } from './gate';

describe('canAudit', () => {
	it('is true for an auditor', () => {
		expect(canAudit({ role: 'auditor', is_admin: false })).toBe(true);
	});
	it('is true for an admin regardless of role string', () => {
		expect(canAudit({ role: 'member', is_admin: true })).toBe(true);
	});
	it('is false for member and viewer', () => {
		expect(canAudit({ role: 'member', is_admin: false })).toBe(false);
		expect(canAudit({ role: 'viewer', is_admin: false })).toBe(false);
	});
	it('is false for null/undefined', () => {
		expect(canAudit(null)).toBe(false);
		expect(canAudit(undefined)).toBe(false);
	});
});
