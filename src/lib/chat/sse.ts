export type StreamFrame =
  | { type: 'start'; lq_ai_message_id: string; chat_id: string }
  | {
      type: 'delta';
      delta: string;
      lq_ai_message_id: string;
      routed_inference_tier?: number | null;
      applied_skills?: string[];
    }
  | {
      type: 'complete';
      lq_ai_message_id: string;
      message: { id: string; content: string; routed_inference_tier?: number | null; routed_provider?: string | null };
      /** Deprecated: empty under M2-A2; citations come from the per-message endpoint. */
      citations?: unknown[];
      routed_inference_tier?: number | null;
    }
  | { type: 'error'; code?: string; message: string }
  | { type: 'done' };

/** Parse one SSE `data:` payload into a typed frame, or null to skip. */
export function parseDataPayload(payload: string): StreamFrame | null {
  if (payload === '[DONE]') return { type: 'done' };
  let obj: unknown;
  try {
    obj = JSON.parse(payload);
  } catch {
    return null;
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    // Validate required fields per frame type so a malformed frame is skipped
    // rather than corrupting content (e.g. appending "undefined") or throwing.
    if (o.type === 'start') {
      return typeof o.lq_ai_message_id === 'string' ? (o as unknown as StreamFrame) : null;
    }
    if (o.type === 'delta') {
      return typeof o.delta === 'string' ? (o as unknown as StreamFrame) : null;
    }
    if (o.type === 'complete') {
      return o.message && typeof o.message === 'object' ? (o as unknown as StreamFrame) : null;
    }
    if (o.type === 'error') {
      return { type: 'error', code: o.code as string | undefined, message: (o.message as string) ?? 'Stream failed' };
    }
    if (o.detail && typeof o.detail === 'object') {
      const d = o.detail as Record<string, unknown>;
      return { type: 'error', code: d.code as string | undefined, message: (d.message as string) ?? 'Stream failed' };
    }
  }
  return null;
}

/** Stateful parser: feed decoded text chunks, get frames for each complete `\n\n`-terminated event. */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): StreamFrame[] {
      buffer += chunk;
      const frames: StreamFrame[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = rawEvent.split('\n').filter((l) => l.startsWith('data:'));
        if (dataLines.length === 0) continue;
        const payload = dataLines.map((l) => l.slice(5).replace(/^ /, '')).join('\n');
        const frame = parseDataPayload(payload);
        if (frame) frames.push(frame);
      }
      return frames;
    }
  };
}
