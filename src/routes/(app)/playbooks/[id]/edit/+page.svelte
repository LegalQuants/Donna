<script lang="ts">
  import { enhance } from '$app/forms';
  import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
  import { isValidDraft } from '$lib/playbooks/editorDraft';
  import type { PlaybookCreate } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let edited = $state<PlaybookCreate | null>(null);
  const canSave = $derived(!!edited && isValidDraft(edited));
</script>

<svelte:head><title>Edit {data.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks/{data.id}" class="text-xs text-mlq-muted hover:underline">← {data.name}</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">Edit playbook</h1>

  <div class="mt-6">
    <PlaybookEditor initial={data.initial} onchange={(v) => (edited = v)} />
    {#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
    <form method="POST" action="?/save" use:enhance class="mt-4">
      <input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
      <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Save changes</button>
    </form>
  </div>
</div>
