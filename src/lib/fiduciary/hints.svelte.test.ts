import { describe, it, expect, beforeEach } from 'vitest';
import { createHintStore, DISMISSED_HINTS_KEY } from './hints.svelte';

beforeEach(() => localStorage.clear());

describe('createHintStore', () => {
	it('reports nothing dismissed by default', () => {
		expect(createHintStore().isDismissed('h1')).toBe(false);
	});
	it('dismiss(id) marks it and persists a JSON array to localStorage', () => {
		const s = createHintStore();
		s.dismiss('h1');
		expect(s.isDismissed('h1')).toBe(true);
		expect(JSON.parse(localStorage.getItem(DISMISSED_HINTS_KEY)!)).toEqual(['h1']);
	});
	it('a fresh store reads the persisted set back (round-trip)', () => {
		createHintStore().dismiss('h1');
		const s2 = createHintStore();
		expect(s2.isDismissed('h1')).toBe(true);
		expect(s2.isDismissed('other')).toBe(false);
	});
	it('dismiss is idempotent — no duplicate persistence', () => {
		const s = createHintStore();
		s.dismiss('h1');
		s.dismiss('h1');
		expect(JSON.parse(localStorage.getItem(DISMISSED_HINTS_KEY)!)).toEqual(['h1']);
	});
	it('degrades a malformed stored value to an empty set without throwing', () => {
		localStorage.setItem(DISMISSED_HINTS_KEY, '{not json');
		expect(() => createHintStore().isDismissed('h1')).not.toThrow();
		expect(createHintStore().isDismissed('h1')).toBe(false);
	});
	it('ignores non-string members in a stored array', () => {
		localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify(['ok', 3, null]));
		const s = createHintStore();
		expect(s.isDismissed('ok')).toBe(true);
	});
});
