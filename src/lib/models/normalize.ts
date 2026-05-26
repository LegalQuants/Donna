import type { RawModelEntry, ChatModelOption } from './types';

// Resolved-model substrings that mark a non-chat model (belt-and-suspenders for
// future aliases; today only `embedding` needs filtering among aliases).
const NON_CHAT = [
  'text-embedding', 'whisper', 'tts', 'dall-e', 'gpt-image',
  'image-', 'moderation', 'realtime', 'sora',
  '-audio', // hyphen-anchored so it can't swallow a hypothetical chat alias merely containing "audio"
  'transcribe'
];

function isNonChat(entry: RawModelEntry): boolean {
  if (entry.id === 'embedding') return true;
  const r = (entry.lq_ai_resolves_to ?? '').toLowerCase();
  return NON_CHAT.some((needle) => r.includes(needle));
}

/** "anthropic-prod/claude-opus-4-7" → "Opus 4.7"; non-Claude → tail; empty → "". */
export function prettifyModel(resolvesTo: string | null | undefined): string {
  if (!resolvesTo) return '';
  const tail = resolvesTo.split('/').pop() ?? '';
  const m = tail.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (m) {
    const family = m[1][0].toUpperCase() + m[1].slice(1);
    return `${family} ${m[2]}.${m[3]}`;
  }
  return tail;
}

/** Filter the raw /models list to chat-usable aliases, normalized for the picker. */
export function toChatOptions(raw: RawModelEntry[]): ChatModelOption[] {
  return raw
    .filter((e) => e.lq_ai_kind === 'alias' && !isNonChat(e))
    .map((e) => {
      const resolved = e.lq_ai_resolves_to ?? null;
      const isLocal = (resolved ?? '').toLowerCase().startsWith('ollama') || e.routed_inference_tier === 1;
      return {
        id: e.id,
        label: prettifyModel(resolved),
        resolvedModel: resolved,
        group: isLocal ? 'local' : 'cloud',
        tier: e.routed_inference_tier ?? null
      } satisfies ChatModelOption;
    });
}
