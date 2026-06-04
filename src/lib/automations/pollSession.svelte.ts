import { parseReceipt, parseSessionSummary, type SessionReceipt, type SessionSummary } from './types';

const TERMINAL = new Set(['completed', 'halted', 'failed']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PollOpts {
  pollMs?: number;
}

/** Polls the BFF proxy for one session until it reaches a terminal status.
 *  Mirrors the runFlow.svelte.ts pattern (rune state + sleep loop).
 *
 *  Contract:
 *  - `done` is true ONLY when polling ended on its own — a terminal status
 *    OR an error. An external `stop()` (e.g. unmount) leaves `done` false.
 *  - When `done` is true, check `error`: null = clean terminal stop, non-null
 *    = stopped because of a transport/parse failure. */
export function createSessionPoll(id: string, opts: PollOpts = {}) {
  const pollMs = opts.pollMs ?? 2000;
  let session = $state<SessionSummary | null>(null);
  let receipt = $state<SessionReceipt | null>(null);
  let done = $state(false);
  let error = $state<string | null>(null);
  let running = false;

  /** One poll. Returns true when polling should stop (terminal status or error). */
  async function tick(): Promise<boolean> {
    const res = await fetch(`/automations/${id}`);
    if (!res.ok) {
      error = 'Lost contact with the session.';
      return true;
    }
    const body = (await res.json()) as { session?: unknown; receipt?: unknown };
    const parsed = parseSessionSummary(body.session);
    if (!parsed) {
      error = 'Received a malformed session response.';
      return true;
    }
    session = parsed;
    receipt = parseReceipt(body.receipt);
    return TERMINAL.has(parsed.status);
  }

  async function start() {
    if (running) return;
    running = true;
    done = false;
    error = null;
    while (running) {
      const finished = await tick();
      if (finished) {
        done = true;
        break;
      }
      await sleep(pollMs);
    }
    running = false;
  }

  function stop() {
    running = false;
  }

  return {
    get session() { return session; },
    get receipt() { return receipt; },
    get done() { return done; },
    get error() { return error; },
    start,
    stop
  };
}
