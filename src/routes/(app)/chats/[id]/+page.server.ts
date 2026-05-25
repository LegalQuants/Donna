import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ChatMessage } from '$lib/chat/chatStream.svelte';

export const load: PageServerLoad = async (event) => {
  const draft = event.cookies.get('donna_draft') ?? null;
  if (draft) event.cookies.delete('donna_draft', { path: '/' });

  const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages?limit=100`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load this chat.');
  const page = (await res.json()) as { items: ChatMessage[] };

  const messages: ChatMessage[] = page.items.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    routed_inference_tier: m.routed_inference_tier,
    status: 'done'
  }));

  return { chatId: event.params.id, messages, draft };
};
