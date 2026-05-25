import { createSseParser, type StreamFrame } from './sse';
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';

export interface ChatMessage {
  /** Stable client-side identity for list keying; never changes after creation.
   *  (`id` tracks the backend message id and CAN change when the start/complete
   *  frame lands, so it must not be used as the {#each} key.) */
  key: string;
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  routed_inference_tier?: number | null;
  status?: 'streaming' | 'done' | 'error';
  error?: string;
  citations?: Citation[];
}

export function createChatStream(chatId: string, initial: ChatMessage[] = []) {
  let messages = $state<ChatMessage[]>(initial);
  let status = $state<'idle' | 'streaming' | 'error'>('idle');
  let controller: AbortController | null = null;

  function setError(idx: number, msg: string) {
    messages[idx].status = 'error';
    messages[idx].error = msg;
    status = 'error';
  }

  function applyFrame(idx: number, frame: StreamFrame) {
    const m = messages[idx];
    if (frame.type === 'start') {
      m.id = frame.lq_ai_message_id;
    } else if (frame.type === 'delta') {
      m.content += frame.delta;
      if (frame.routed_inference_tier != null) m.routed_inference_tier = frame.routed_inference_tier;
    } else if (frame.type === 'complete') {
      m.id = frame.message.id ?? m.id;
      m.content = frame.message.content ?? m.content;
      const tier = frame.message.routed_inference_tier ?? frame.routed_inference_tier;
      if (tier != null) m.routed_inference_tier = tier;
      m.status = 'done';
    } else if (frame.type === 'error') {
      setError(idx, frame.message);
    }
  }

  let lastUserContent = '';

  // Citations live in the M2-A2 relational table, not the SSE complete frame.
  // Fetch them by message id once the assistant turn is persisted (one retry to
  // cover the persist/fetch race).
  async function loadCitations(idx: number) {
    const id = messages[idx].id;
    if (!id || id === 'pending') return;
    if (!hasCitationMarkers(messages[idx].content)) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/chats/${chatId}/messages/${id}/citations`);
        if (!res.ok) {
          if (import.meta.env.DEV) console.warn(`loadCitations: ${res.status} for message ${id}`);
          return;
        }
        const cites = (await res.json()) as Citation[];
        // attempt 0: only accept a non-empty result (covers the persist/fetch race); attempt 1: accept whatever (give up).
        if (cites.length > 0 || attempt === 1) { messages[idx].citations = cites; return; }
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Stream a response into the assistant message at `idx` (already present and
  // reset to a streaming state by the caller). Shared by send() and retry().
  async function runStream(idx: number, content: string) {
    status = 'streaming';
    controller = new AbortController();
    try {
      const res = await fetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        setError(idx, 'Could not reach the model. Please try again.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let ended = false;
      try {
        while (!ended) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
            if (frame.type === 'done') { ended = true; break; }
            applyFrame(idx, frame);
            if (frame.type === 'error') { ended = true; break; }
          }
        }
        // Flush any bytes the decoder buffered if the stream ended without [DONE].
        if (!ended) {
          for (const frame of parser.push(decoder.decode())) {
            if (frame.type === 'done') break;
            applyFrame(idx, frame);
            if (frame.type === 'error') break;
          }
        }
      } finally {
        // Release the connection promptly on done/error/normal exit.
        reader.cancel().catch(() => {});
      }
      if (messages[idx].status === 'streaming') messages[idx].status = 'done';
      if (status === 'streaming') status = 'idle';
      await loadCitations(idx);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        messages[idx].status = 'done';
        status = 'idle';
      } else {
        setError(idx, 'The connection was lost. Please try again.');
      }
    } finally {
      controller = null;
    }
  }

  async function send(content: string) {
    if (status === 'streaming') return;
    lastUserContent = content;
    messages = [
      ...messages,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
      { key: crypto.randomUUID(), id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    await runStream(messages.length - 1, content);
  }

  // Re-run the last exchange in place (no duplicate user/assistant turns): reset
  // the trailing assistant message and stream a fresh response for it.
  async function retry() {
    if (status === 'streaming') return;
    const idx = messages.length - 1;
    if (idx < 0 || messages[idx].role !== 'assistant') return;
    messages[idx].content = '';
    messages[idx].error = undefined;
    messages[idx].routed_inference_tier = undefined;
    messages[idx].citations = undefined;
    messages[idx].status = 'streaming';
    await runStream(idx, lastUserContent);
  }

  function stop() {
    controller?.abort();
  }

  return {
    get messages() {
      return messages;
    },
    get status() {
      return status;
    },
    send,
    retry,
    stop
  };
}
