import { createSseParser, type StreamFrame } from './sse';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  routed_inference_tier?: number | null;
  status?: 'streaming' | 'done' | 'error';
  error?: string;
  citations?: unknown[];
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
      m.citations = frame.citations ?? [];
      m.status = 'done';
    } else if (frame.type === 'error') {
      setError(idx, frame.message);
    }
  }

  async function send(content: string) {
    if (status === 'streaming') return;
    messages = [
      ...messages,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    const idx = messages.length - 1;
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
      while (!ended) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          if (frame.type === 'done') { ended = true; break; }
          applyFrame(idx, frame);
          if (frame.type === 'error') { ended = true; break; }
        }
      }
      if (messages[idx].status === 'streaming') messages[idx].status = 'done';
      if (status === 'streaming') status = 'idle';
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
    stop
  };
}
