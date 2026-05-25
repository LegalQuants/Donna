<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit
  }: { value?: string; placeholder?: string; onsubmit?: (text: string) => void } = $props();

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
      submit();
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
  <button
    type="button"
    onclick={submit}
    disabled={!value.trim()}
    aria-label="Send"
    class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40"
  >
    <ArrowRight size={18} />
  </button>
</div>
