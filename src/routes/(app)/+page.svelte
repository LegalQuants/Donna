<script lang="ts">
  import { enhance } from '$app/forms';
  import Composer from '$lib/components/Composer.svelte';
  import { createSkillAttach } from '$lib/skills/attach.svelte';

  let { data, form } = $props();
  let message = $state('');
  let selectedMatterId = $state<string | null>(null);
  let formEl = $state<HTMLFormElement>();
  const skillAttach = createSkillAttach();

  const name = $derived(data.user?.display_name || data.user?.email?.split('@')[0] || 'there');
</script>

<div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6">
  <h1 class="mlq-rise mb-8 text-center font-serif text-4xl font-light text-mlq-strong">Hi, {name}</h1>

  <form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
    <input type="hidden" name="message" value={message} />
    <input type="hidden" name="project_id" value={selectedMatterId ?? ''} />
    {#each skillAttach.names as s (s)}
      <input type="hidden" name="skills" value={s} />
    {/each}
    <Composer bind:value={message} matters={data.matters} bind:selectedMatterId {skillAttach} onsubmit={() => formEl?.requestSubmit()} />
  </form>

  {#if form?.error}<p class="mt-3 text-center text-sm text-mlq-error">{form.error}</p>{/if}
  <p class="mt-3 text-center text-xs text-mlq-muted">AI can make mistakes. Answers are not legal advice.</p>
</div>
