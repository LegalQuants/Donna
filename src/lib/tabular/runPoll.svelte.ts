import { isTerminal, type TabularExecution } from './types';

const POLL_MS = 2000;
const STUCK_MS = 5 * 60 * 1000;

export function createRunPoll(executionId: string, initial: TabularExecution | null = null) {
  let execution = $state<TabularExecution | null>(initial);
  let stuck = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let stuckTimer: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    if (timer) clearInterval(timer);
    if (stuckTimer) clearTimeout(stuckTimer);
    timer = null;
    stuckTimer = null;
  }

  return {
    get execution() {
      return execution;
    },
    get status() {
      return execution?.status ?? 'pending';
    },
    get stuck() {
      return stuck;
    },
    start(fetchFn: typeof fetch = fetch) {
      if (execution && isTerminal(execution.status)) return;
      stuckTimer = setTimeout(() => {
        if (!execution || !isTerminal(execution.status)) stuck = true;
      }, STUCK_MS);
      timer = setInterval(async () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
          const res = await fetchFn(`/tabular-executions/${executionId}`);
          if (!res.ok) return;
          const next = (await res.json()) as TabularExecution;
          execution = next;
          if (isTerminal(next.status)) stop();
        } catch {
          /* tolerate; keep polling */
        }
      }, POLL_MS);
    },
    stop
  };
}
