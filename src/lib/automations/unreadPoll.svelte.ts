const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Light background poll of the unread notification count. Seeds from SSR, then
 *  refreshes every ~30s while the Automations area is mounted. Best-effort. */
export function createUnreadPoll(initial: number, opts: { pollMs?: number } = {}) {
  const pollMs = opts.pollMs ?? 30_000;
  let count = $state(initial);
  let running = false;

  async function start() {
    if (running) return;
    running = true;
    while (running) {
      await sleep(pollMs);
      if (!running) break;
      try {
        const res = await fetch('/automations/notifications/unread');
        if (res.ok) {
          const body = (await res.json()) as { unread?: unknown };
          if (typeof body.unread === 'number') count = body.unread;
        }
      } catch {
        /* ignore — keep last known count */
      }
    }
  }
  function stop() { running = false; }

  return {
    get count() { return count; },
    start,
    stop
  };
}
