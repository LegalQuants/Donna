import { parseReceipt, parseSessionSummary, type SessionReceipt, type SessionSummary } from './types';

const TERMINAL = new Set(['completed', 'halted', 'failed']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PollOpts {
  pollMs?: number;
}

/** Polls the BFF proxy for one session until it reaches a terminal status.
 *  Mirrors the runFlow.svelte.ts pattern (rune state + sleep loop). */
export function createSessionPoll(id: string, opts: PollOpts = {}) {
  const pollMs = opts.pollMs ?? 2000;
  let session = $state<SessionSummary | null>(null);
  let receipt = $state<SessionReceipt | null>(null);
  let done = $state(false);
  let error = $state<string | null>(null);
  let running = false;

  async function tick(): Promise<boolean> {
    const res = await fetch(`/automations/${id}`);
    if (!res.ok) {
      error = 'Lost contact with the session.';
      return true; // stop on error
    }
    const body = (await res.json()) as { session?: unknown; receipt?: unknown };
    session = parseSessionSummary(body.session);
    receipt = parseReceipt(body.receipt);
    return !!session && TERMINAL.has(session.status);
  }

  async function start() {
    if (running) return;
    running = true;
    done = false;
    error = null;
    while (running) {
      const terminal = await tick();
      if (terminal) break;
      await sleep(pollMs);
    }
    done = true;
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
