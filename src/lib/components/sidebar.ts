export const SIDEBAR_KEY = 'donna:sidebar-open';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function loadSidebar(): boolean {
  if (!hasStorage()) return true;
  return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
}

export function persistSidebar(open: boolean): void {
  if (hasStorage()) localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
}
