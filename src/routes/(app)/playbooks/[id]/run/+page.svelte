<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import DocumentChooser from '$lib/playbooks/DocumentChooser.svelte';
  import RunProgress from '$lib/playbooks/RunProgress.svelte';
  import ExecutionResults from '$lib/playbooks/ExecutionResults.svelte';
  import { createRunFlow } from '$lib/playbooks/runFlow.svelte';
  import type { ExecutionResults as ExecResults } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // playbookId is fixed for the lifetime of this page (it is the route param).
  const flow = createRunFlow(untrack(() => data.playbook.id), {
    onExecutionStarted: (id) => {
      const url = new URL(page.url);
      url.searchParams.set('execution', id);
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- push ?execution= param, no resolve needed
      replaceState(`${url.pathname}${url.search}`, {});
    }
  });

  let usedUpload = $state(false);

  // Resume a server-loaded execution (reload-safe ?execution=).
  let resumed = false;
  $effect(() => {
    const exec = data.execution;
    if (exec && !resumed) {
      resumed = true;
      flow.resume(exec as typeof exec & { results?: ExecResults; error?: string | null });
    }
  });
</script>

<svelte:head><title>Run {data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks/{data.playbook.id}" class="text-xs text-mlq-muted hover:underline">← {data.playbook.name}</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">Run against a document</h1>
  <p class="mt-1 text-sm text-mlq-muted">{data.playbook.name} · {data.playbook.contract_type}</p>

  {#if flow.phase === 'idle'}
    <div class="mt-6">
      <DocumentChooser
        matters={data.matters}
        matterFiles={data.matterFiles}
        onupload={(file) => { usedUpload = true; flow.runWithUpload(file); }}
        onpick={(documentId) => flow.runWithDocument(documentId)}
      />
    </div>
  {:else if flow.phase !== 'done'}
    <div class="mt-6">
      <RunProgress phase={flow.phase} error={flow.error} skipUpload={!usedUpload} />
      {#if flow.stuck}
        <p class="mt-2 text-xs text-mlq-muted">Still running — you can reload this page to resume.</p>
      {/if}
    </div>
  {/if}

  {#if flow.phase === 'done' && flow.results}
    <div class="mt-6"><ExecutionResults results={flow.results} /></div>
  {/if}
</div>
