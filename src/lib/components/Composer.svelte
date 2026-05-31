<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowRight, Square, X, Sparkles } from '@lucide/svelte';
  import ModelPicker from './ModelPicker.svelte';
  import SkillAttach from './SkillAttach.svelte';
  import EnhancePreview from './EnhancePreview.svelte';
  import MatterPicker from '$lib/matters/MatterPicker.svelte';
  import PromptPicker from '$lib/prompts/PromptPicker.svelte';
  import { spliceText } from '$lib/prompts/spliceText';
  import { modelStore } from '$lib/models/store.svelte';
  import type { createSkillAttach } from '$lib/skills/attach.svelte';
  import type { createEnhance } from '$lib/enhance/enhance.svelte';
  import type { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
  import type { MatterSummary } from '$lib/matters/types';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop,
    skillAttach,
    enhance,
    promptLibrary,
    matters,
    selectedMatterId = $bindable(null as string | null),
    minimumTier = null as 1 | 2 | 3 | 4 | 5 | null
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string, skills: string[]) => void;
    streaming?: boolean;
    onstop?: () => void;
    skillAttach?: ReturnType<typeof createSkillAttach>;
    enhance?: ReturnType<typeof createEnhance>;
    promptLibrary?: ReturnType<typeof createPromptLibrary>;
    matters?: MatterSummary[];
    selectedMatterId?: string | null;
    minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();

  onMount(() => {
    modelStore.load();
  });

  function autogrow() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
  }
  function insertAtCursor(text: string) {
    if (!textarea) { value = value ? `${value}\n${text}` : text; return; }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const result = spliceText(value, start, end, text);
    value = result.value;
    const el = textarea;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
      autogrow();
    });
  }
  function submit() {
    const text = value.trim();
    if (!text) return;
    onsubmit?.(text, modelStore.selectedModel, skillAttach?.names ?? []);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) submit();
    }
  }
</script>

<div class="rounded-t-mlq-composer border border-mlq-subtle bg-mlq-surface p-3 shadow-sm">
  {#if enhance}
    {#if enhance.status === 'preview' && enhance.result}
      <EnhancePreview result={enhance.result} onaccept={() => (value = enhance.accept())} ondiscard={enhance.discard} />
    {:else if enhance.status === 'skipped'}
      <p class="mb-2 text-xs text-mlq-muted">No changes suggested.</p>
    {:else if enhance.status === 'error'}
      <p class="mb-2 text-xs text-mlq-muted">Couldn't enhance the prompt.</p>
    {/if}
  {/if}

  {#if skillAttach && skillAttach.attached.length}
    <div class="mb-2 flex flex-wrap gap-1.5">
      {#each skillAttach.attached as s (s.slug)}
        <span class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text">
          {s.title}
          <button
            type="button"
            aria-label={`Remove ${s.title}`}
            onclick={() => skillAttach?.remove(s.slug)}
            class="text-mlq-muted hover:text-mlq-text"
          >
            <X size={12} />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <textarea
    bind:this={textarea}
    bind:value
    {placeholder}
    rows="1"
    oninput={autogrow}
    {onkeydown}
    class="max-h-48 w-full resize-none bg-transparent font-serif text-mlq-text outline-none placeholder:text-mlq-muted"
  ></textarea>

  <div class="mt-2 flex items-center gap-2 border-t border-mlq-subtle pt-2">
    <ModelPicker
      options={modelStore.options}
      selected={modelStore.selectedModel}
      error={modelStore.error}
      {minimumTier}
      onselect={modelStore.setModel}
    />
    {#if matters}
      <MatterPicker {matters} bind:selectedId={selectedMatterId} />
    {/if}
    {#if skillAttach}
      <SkillAttach
        results={skillAttach.results}
        loading={skillAttach.loading}
        error={skillAttach.error}
        onopen={skillAttach.open}
        onsearch={skillAttach.search}
        onattach={skillAttach.attach}
      />
    {/if}
    {#if promptLibrary}
      <PromptPicker
        prompts={promptLibrary.prompts}
        loading={promptLibrary.loading}
        error={promptLibrary.error}
        draft={value}
        onopen={promptLibrary.ensureLoaded}
        oninsert={insertAtCursor}
        onsave={promptLibrary.create}
      />
    {/if}
    {#if enhance}
      {#if enhance.status === 'loading'}
        <span class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-muted">
          Enhancing…
          <button type="button" aria-label="Cancel enhance" onclick={enhance.cancel} class="hover:text-mlq-text"><X size={12} /></button>
        </span>
      {:else}
        <button
          type="button"
          data-testid="enhance-button"
          onclick={() => enhance.run(value)}
          disabled={!value.trim()}
          class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text disabled:opacity-40"
        >
          <Sparkles size={13} /> Enhance
        </button>
      {/if}
    {/if}
    <span class="flex-1"></span>
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
</div>
