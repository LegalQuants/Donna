<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Composer from '$lib/components/Composer.svelte';
  import Message from '$lib/components/Message.svelte';
  import { createChatStream } from '$lib/chat/chatStream.svelte';
  import ReceiptsDrawer from '$lib/components/ReceiptsDrawer.svelte';
  import { modelStore } from '$lib/models/store.svelte';
  import { createSkillAttach } from '$lib/skills/attach.svelte';
  import { createEnhance } from '$lib/enhance/enhance.svelte';
  import { ReceiptText } from '@lucide/svelte';
  import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
  import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
  import MatterBadge from '$lib/matters/MatterBadge.svelte';
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';
  import { pickValidModel } from '$lib/models/pickValidModel';

  let { data } = $props();

  // Seed the controller once from the initial server load (untrack documents the
  // intentional one-time read). NOTE: if direct chat→chat navigation is added
  // later (e.g. sidebar recents), wrap this page's body in {#key data.chatId} via
  // a child component so the controller re-initializes per chat.
  const chat = untrack(() => createChatStream(data.chatId, data.messages));
  const skillAttach = createSkillAttach();
  const enhance = untrack(() => createEnhance(data.chatId, () => skillAttach.names));
  const docPanel = createDocPanel();
  let draftValue = $state('');
  let showReceipts = $state(false);
  let scroller = $state<HTMLElement>();

  function submit(text: string, model = 'smart', skills: string[] = []) {
    draftValue = '';
    chat.send(text, model, skills);
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

  // When the chat is scoped to a tier-floored matter, ensure the selected
  // model satisfies the floor. Only swaps when the chosen id differs, so
  // it doesn't loop on setModel updates.
  $effect(() => {
    const tier = data.matter?.minimumTier ?? null;
    if (tier == null || modelStore.options.length === 0) return;
    const chosen = pickValidModel(modelStore.options, modelStore.selectedModel, tier);
    if (chosen !== modelStore.selectedModel) modelStore.setModel(chosen);
  });

  // Land → stream: if the landing handed us a draft and this is a fresh chat, send it.
  // Use the picker selection (persisted to localStorage on the landing composer) so a
  // model chosen before the first message is honored, not silently reset to smart.
  onMount(() => {
    if (data.draft && data.messages.length === 0) submit(data.draft, modelStore.selectedModel);
  });
</script>

<div class="flex h-full min-h-0">
  <div class="flex min-w-0 flex-1 flex-col">
    <div class="flex items-center justify-between border-b border-mlq-subtle px-6 py-2">
      <div class="flex items-center gap-2">
        <MatterBadge matter={data.matter} />
        {#if data.matter?.privileged}<PrivilegedChip />{/if}
      </div>
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
          <Message message={m} onretry={retry} onactivatecitation={(c) => docPanel.open(c)} />
        {/each}
      </div>
    </div>

    <div class="mx-auto w-full max-w-2xl px-6 pb-4">
      <Composer
        bind:value={draftValue}
        onsubmit={submit}
        streaming={chat.status === 'streaming'}
        onstop={chat.stop}
        {skillAttach}
        {enhance}
        minimumTier={data.matter?.minimumTier ?? null}
      />
      <p class="mt-2 text-center text-xs text-mlq-muted">AI can make mistakes. Answers are not legal advice.</p>
    </div>

    <ReceiptsDrawer chatId={data.chatId} open={showReceipts} onclose={() => (showReceipts = false)} />
  </div>
  {#if docPanel.open_}
    <DocumentPanel {docPanel} />
  {/if}
</div>
