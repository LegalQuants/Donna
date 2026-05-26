<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Composer from '$lib/components/Composer.svelte';
  import Message from '$lib/components/Message.svelte';
  import { createChatStream } from '$lib/chat/chatStream.svelte';
  import ReceiptsDrawer from '$lib/components/ReceiptsDrawer.svelte';
  import { ReceiptText } from '@lucide/svelte';

  let { data } = $props();

  // Seed the controller once from the initial server load (untrack documents the
  // intentional one-time read). NOTE: if direct chat→chat navigation is added
  // later (e.g. sidebar recents), wrap this page's body in {#key data.chatId} via
  // a child component so the controller re-initializes per chat.
  const chat = untrack(() => createChatStream(data.chatId, data.messages));
  let draftValue = $state('');
  let showReceipts = $state(false);
  let scroller = $state<HTMLElement>();

  function submit(text: string, model = 'smart') {
    draftValue = '';
    chat.send(text, model);
  }
  function retry() {
    chat.retry();
  }

  // Auto-scroll to the newest content as messages/stream update.
  $effect(() => {
    const _len = chat.messages.length;
    const _last = chat.messages[chat.messages.length - 1]?.content;
    void _len;
    void _last;
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  });

  // Land → stream: if the landing handed us a draft and this is a fresh chat, send it.
  onMount(() => {
    if (data.draft && data.messages.length === 0) submit(data.draft);
  });
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-end border-b border-mlq-subtle px-6 py-2">
    <button
      type="button"
      onclick={() => (showReceipts = true)}
      class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
    >
      <ReceiptText size={14} /> Receipts
    </button>
  </div>

  <div bind:this={scroller} class="flex-1 overflow-y-auto">
    <div class="mx-auto max-w-2xl px-6 py-8">
      {#each chat.messages as m (m.key)}
        <Message message={m} onretry={retry} />
      {/each}
    </div>
  </div>

  <div class="mx-auto w-full max-w-2xl px-6 pb-4">
    <Composer
      bind:value={draftValue}
      onsubmit={submit}
      streaming={chat.status === 'streaming'}
      onstop={chat.stop}
    />
    <p class="mt-2 text-center text-xs text-mlq-muted">AI can make mistakes. Answers are not legal advice.</p>
  </div>

  <ReceiptsDrawer chatId={data.chatId} open={showReceipts} onclose={() => (showReceipts = false)} />
</div>
