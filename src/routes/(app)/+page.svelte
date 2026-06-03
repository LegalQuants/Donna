<script lang="ts">
  import { enhance } from '$app/forms';
  import { onDestroy } from 'svelte';
  import Composer from '$lib/components/Composer.svelte';
  import { createSkillAttach } from '$lib/skills/attach.svelte';
  import { createEnhance } from '$lib/enhance/enhance.svelte';
  import { createFileAttach } from '$lib/files/fileAttach.svelte';
  import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
  import { rebrandName } from '$lib/brand';

  let { data, form } = $props();
  let message = $state('');
  let selectedMatterId = $state<string | null>(null);
  let formEl = $state<HTMLFormElement>();
  const skillAttach = createSkillAttach();
  // Standalone enhance: landing has no chat yet, so chat_id is null (backend accepts it).
  // Named `promptEnhance` to avoid shadowing the `$app/forms` `enhance` form action above.
  // No `untrack` needed (unlike the in-chat page) — nothing reactive is read at construction.
  const promptEnhance = createEnhance(null, () => skillAttach.names);
  const fileAttach = createFileAttach();
  onDestroy(() => fileAttach.dispose());
  const promptLibrary = createPromptLibrary();

  const name = $derived(rebrandName(data.user?.display_name) || data.user?.email?.split('@')[0] || 'there');
</script>

<div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6">
  <h1 class="mlq-rise mb-8 text-center font-serif text-4xl font-light text-mlq-strong">Hi, {name}</h1>

  <form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
    <input type="hidden" name="message" value={message} />
    <input type="hidden" name="project_id" value={selectedMatterId ?? ''} />
    {#each skillAttach.names as s (s)}
      <input type="hidden" name="skills" value={s} />
    {/each}
    <input type="hidden" name="skill_inputs" value={JSON.stringify(skillAttach.skillInputs)} />
    <input type="hidden" name="file_ids" value={JSON.stringify(fileAttach.fileIds)} />
    <Composer bind:value={message} matters={data.matters} bind:selectedMatterId {skillAttach} {fileAttach} enhance={promptEnhance} {promptLibrary} onsubmit={() => formEl?.requestSubmit()} />
  </form>

  {#if form?.error}<p class="mt-3 text-center text-sm text-mlq-error">{form.error}</p>{/if}
  <p class="mt-3 text-center text-xs text-mlq-muted">AI can make mistakes. Answers are not legal advice.</p>
</div>
