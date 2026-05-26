import type { EnhancePromptResponse } from './types';

export function createEnhance(chatId: string, getSkills: () => string[]) {
  let status = $state<'idle' | 'loading' | 'preview' | 'skipped' | 'error'>('idle');
  let result = $state<EnhancePromptResponse | null>(null);
  let controller: AbortController | null = null;

  function patchOutcome(id: string, used: boolean, fetchFn: typeof fetch) {
    // Fire-and-forget telemetry — failures are non-blocking.
    fetchFn(`/enhance-prompt/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ used })
    }).catch(() => {});
  }

  async function run(rawInput: string, fetchFn: typeof fetch = fetch) {
    if (!rawInput.trim() || status === 'loading') return;
    status = 'loading';
    result = null;
    controller = new AbortController();
    try {
      const res = await fetchFn('/enhance-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw_input: rawInput, chat_id: chatId, attached_skills: getSkills().map((name) => ({ name })) }),
        signal: controller.signal
      });
      if (!res.ok) {
        status = 'error';
        return;
      }
      result = (await res.json()) as EnhancePromptResponse;
      status = result.expansion_applied ? 'preview' : 'skipped';
    } catch (e) {
      status = (e as Error).name === 'AbortError' ? 'idle' : 'error';
    } finally {
      controller = null;
    }
  }

  function cancel() {
    controller?.abort();
  }

  /** Apply the enhancement: returns the expanded prompt and records used=true. */
  function accept(fetchFn: typeof fetch = fetch): string {
    const text = result?.expanded_prompt ?? '';
    if (result?.interaction_id) patchOutcome(result.interaction_id, true, fetchFn);
    status = 'idle';
    result = null;
    return text;
  }

  function discard(fetchFn: typeof fetch = fetch) {
    if (result?.interaction_id) patchOutcome(result.interaction_id, false, fetchFn);
    status = 'idle';
    result = null;
  }

  return {
    get status() {
      return status;
    },
    get result() {
      return result;
    },
    run,
    cancel,
    accept,
    discard
  };
}
