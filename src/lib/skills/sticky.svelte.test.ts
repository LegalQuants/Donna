import { describe, it, expect } from 'vitest';
import { createStickySkills } from './sticky.svelte';

describe('createStickySkills', () => {
	it('seeds enabled/set from a chat on first sync', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', ['a', 'b']);
		expect(s.enabled).toBe(true);
		expect(s.set).toEqual(['a', 'b']);
		expect(s.dirty).toBe(false);
	});

	it('starts off for an empty set', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		expect(s.enabled).toBe(false);
	});

	it('toggle flips enabled, sets dirty, and optimistically unions the turn skills', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		expect(s.enabled).toBe(true);
		expect(s.dirty).toBe(true);
		expect(s.set).toEqual(['x']);
	});

	it('toggle off clears the optimistic set', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', ['x']);
		s.toggle([]);
		expect(s.enabled).toBe(false);
		expect(s.set).toEqual([]);
	});

	it('sendValue returns dirty ? enabled : undefined', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		expect(s.sendValue()).toBeUndefined();
		s.toggle(['x']);
		expect(s.sendValue()).toBe(true);
	});

	it('markSent clears dirty', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		s.markSent();
		expect(s.dirty).toBe(false);
		expect(s.sendValue()).toBeUndefined();
	});

	it('syncFromChat is a no-op for the same chat id (never clobbers an in-progress toggle)', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']); // user flipped on, dirty
		s.syncFromChat('c1', []); // same id — must NOT reset
		expect(s.enabled).toBe(true);
		expect(s.dirty).toBe(true);
	});

	it('syncFromChat re-seeds and resets dirty when the chat id changes', () => {
		const s = createStickySkills();
		s.syncFromChat('c1', []);
		s.toggle(['x']);
		s.syncFromChat('c2', ['y']); // new chat
		expect(s.enabled).toBe(true);
		expect(s.set).toEqual(['y']);
		expect(s.dirty).toBe(false);
	});
});
