<script lang="ts">
  import { ArrowRight, Square } from '@lucide/svelte';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop
  }: { value?: string; placeholder?: string; onsubmit?: (text: string) => void; streaming?: boolean; onstop?: () => void } = $props();

  let textarea = $state<HTMLTextAreaElement>();

  function autogrow() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
  }
  function submit() {
    const text = value.trim();
    if (!text) return;
    onsubmit?.(text);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) submit();
    }
  }
</script>

<div class="flex items-end gap-2 rounded-t-mlq-composer border border-mlq-subtle bg-mlq-surface p-3 shadow-sm">
  <textarea
    bind:this={textarea}
    bind:value
    {placeholder}
    rows="1"
    oninput={autogrow}
    {onkeydown}
    class="max-h-48 flex-1 resize-none bg-transparent font-serif text-mlq-text outline-none placeholder:text-mlq-muted"
  ></textarea>
  {#if streaming}
    <button type="button" onclick={() => onstop?.()} aria-label="Stop" class="rounded-mlq-control bg-mlq-strong p-2 text-white">
      <Square size={18} />
    </button>
  {:else}
    <button type="button" onclick={submit} disabled={!value.trim()} aria-label="Send" class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40">
      <ArrowRight size={18} />
    </button>
  {/if}
</div>
