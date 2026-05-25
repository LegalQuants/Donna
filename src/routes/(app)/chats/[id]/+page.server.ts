import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ChatMessage } from '$lib/chat/chatStream.svelte';
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';

export const load: PageServerLoad = async (event) => {
  const draft = event.cookies.get('donna_draft') ?? null;
  if (draft) event.cookies.delete('donna_draft', { path: '/' });

  const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages?limit=100`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load this chat.');
  const page = (await res.json()) as { items: ChatMessage[] };

  const messages: ChatMessage[] = page.items.map((m) => ({
    key: m.id, // history rows have stable backend ids — safe as the list key
    id: m.id,
    role: m.role,
    content: m.content,
    routed_inference_tier: m.routed_inference_tier,
    status: 'done'
  }));

  // Citations are served per-message (M2-A2), not inline in the messages list.
  // Fetch them in parallel for assistant turns that actually contain markers.
  await Promise.all(
    messages.map(async (m) => {
      if (m.role !== 'assistant' || !hasCitationMarkers(m.content)) return;
      try {
        const r = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages/${m.id}/citations`);
        if (r.ok) m.citations = (await r.json()) as Citation[];
      } catch {
        /* leave undefined — message degrades to plain markers */
      }
    })
  );

  return { chatId: event.params.id, messages, draft };
};
