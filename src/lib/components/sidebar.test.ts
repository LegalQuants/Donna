import { describe, it, expect, beforeEach } from 'vitest';
import { loadSidebar, persistSidebar, SIDEBAR_KEY } from './sidebar';

describe('sidebar persistence', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to open when nothing stored', () => {
    expect(loadSidebar()).toBe(true);
  });

  it('round-trips closed state', () => {
    persistSidebar(false);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('closed');
    expect(loadSidebar()).toBe(false);
  });

  it('round-trips open state', () => {
    persistSidebar(true);
    expect(loadSidebar()).toBe(true);
  });
});
