<script lang="ts">
  import { enhance } from '$app/forms';
  import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
  import type { PlaybookCreate } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let edited = $state<PlaybookCreate | null>(null);
  const canSave = $derived(!!edited && !!edited.name?.trim() && !!edited.contract_type?.trim() && (edited.positions?.length ?? 0) > 0);
</script>

<svelte:head><title>New playbook — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">New playbook</h1>

  <div class="mt-6">
    <PlaybookEditor initial={data.initial} onchange={(v) => (edited = v)} />
    {#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
    <form method="POST" action="?/save" use:enhance class="mt-4">
      <input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
      <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Save playbook</button>
    </form>
  </div>
</div>
