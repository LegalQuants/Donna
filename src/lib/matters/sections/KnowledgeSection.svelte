<script lang="ts">
  import { enhance } from '$app/forms';
  import { X } from '@lucide/svelte';
  import type { components } from '$lib/api/backend';
  import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';

  type KnowledgeBase = components['schemas']['KnowledgeBase'];

  let { kbs }: { kbs: { linked: KnowledgeBase[]; available: KnowledgeBase[] } } = $props();

  let linkForm = $state<HTMLFormElement>();
  let pendingKbId = $state('');

  function pick(kbId: string) {
    pendingKbId = kbId;
    // tick happens via Svelte's DOM update; requestSubmit fires the form once the value is in.
    queueMicrotask(() => linkForm?.requestSubmit());
  }
</script>

<section class="mt-6">
  <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Knowledge</h2>

  {#if kbs.linked.length === 0}
    <div class="flex items-center justify-between gap-3 rounded-mlq-control border border-mlq-subtle px-3 py-3">
      <p class="text-xs text-mlq-muted">No knowledge bases linked. Linking a KB makes its documents available to chats in this matter.</p>
      <KbPicker kbs={kbs.available} onpick={pick} />
    </div>
  {:else}
    <div class="rounded-mlq-control border border-mlq-subtle">
      {#each kbs.linked as k (k.id)}
        <div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
          <a href="/knowledge/{k.id}"
            class="min-w-0 flex-1 truncate text-sm text-mlq-text hover:underline"
          >{k.name}</a>
          <span class="shrink-0 text-xs text-mlq-muted">{k.file_count} files</span>
          <a href="/knowledge/{k.id}"
            class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
          >Manage</a>
          <form
            method="POST"
            action="?/unlinkKb"
            use:enhance
            aria-label={`Unlink ${k.name}`}
            class="shrink-0"
          >
            <input type="hidden" name="kb_id" value={k.id} />
            <button
              type="submit"
              aria-label={`Unlink ${k.name}`}
              class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
            ><X size={14} /></button>
          </form>
        </div>
      {/each}
    </div>
    <div class="mt-2 flex justify-end">
      <KbPicker kbs={kbs.available} onpick={pick} />
    </div>
  {/if}

  <!-- Single hidden form for the picker; its kb_id is set just before requestSubmit. -->
  <form
    bind:this={linkForm}
    method="POST"
    action="?/linkKb"
    use:enhance
    data-testid="link-kb-form"
    class="hidden"
  >
    <input type="hidden" name="kb_id" value={pendingKbId} />
  </form>
</section>
