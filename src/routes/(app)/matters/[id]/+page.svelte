<script lang="ts">
  import { MessageSquare } from '@lucide/svelte';
  import MatterForm from '$lib/matters/MatterForm.svelte';
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';
  import FilesSection from '$lib/matters/sections/FilesSection.svelte';
  import KnowledgeSection from '$lib/matters/sections/KnowledgeSection.svelte';
  import SkillsSection from '$lib/matters/sections/SkillsSection.svelte';
  import ContextSection from '$lib/matters/sections/ContextSection.svelte';

  let { data, form } = $props();
  let showRename = $state(false);
  let confirmArchive = $state(false);

  // A successful rename returns { success: true } (no redirect); close the modal.
  // Keyed on form?.success only, so reopening the modal later doesn't auto-close it.
  $effect(() => {
    if (form?.success) showRename = false;
  });

  // Escape closes whichever modal is open (mirrors ReceiptsDrawer).
  $effect(() => {
    if (!showRename && !confirmArchive) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { showRename = false; confirmArchive = false; } };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  });
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
  <nav class="mb-3 text-xs text-mlq-muted">
    <a href="/matters" class="text-mlq-workflow hover:underline">Matters</a> › {data.matter.name}
  </nav>

  <div class="mb-6 border-b border-mlq-subtle pb-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-serif text-2xl text-mlq-strong">{data.matter.name}</h1>
      {#if data.matter.privileged}<PrivilegedChip />{/if}
    </div>
    {#if data.matter.description}<p class="mt-1 text-sm text-mlq-muted">{data.matter.description}</p>{/if}
    <div class="mt-4 flex items-center gap-2">
      <form method="POST" action="?/newChat">
        <button type="submit" class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white">+ New chat in this matter</button>
      </form>
      <button type="button" onclick={() => (showRename = true)} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text">Rename</button>
      <button type="button" onclick={() => (confirmArchive = true)} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error">Archive</button>
    </div>
  </div>

  <FilesSection files={data.files} error={form?.error ?? ''} />
  <KnowledgeSection kbs={data.kbs} />
  <SkillsSection attached={data.matter.attached_skill_names ?? []} />
  <ContextSection value={data.matter.context_md ?? ''} />

  <h2 class="mt-8 mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Chats · {data.chats.length}</h2>
  {#if data.chats.length === 0}
    <p class="py-6 text-center text-sm text-mlq-muted">No chats in this matter yet.</p>
  {:else}
    <ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
      {#each data.chats as c (c.id)}
        <li>
          <a href="/chats/{c.id}" class="flex items-center gap-3 px-4 py-3 text-sm hover:bg-mlq-surface-alt">
            <MessageSquare size={14} class="text-mlq-muted" />
            <span class="min-w-0 truncate text-mlq-text">{c.title}</span>
            <span class="ml-auto shrink-0 text-xs text-mlq-muted">{c.message_count ?? 0} msgs</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if showRename}
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showRename = false; }}>
    <div role="dialog" aria-modal="true" aria-label="Rename matter" class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg">
      <h2 class="mb-4 font-serif text-lg text-mlq-strong">Rename matter</h2>
      <MatterForm
        action="?/rename"
        submitLabel="Save"
        name={data.matter.name}
        description={data.matter.description ?? ''}
        privileged={data.matter.privileged}
        minimumTier={data.matter.minimum_inference_tier ?? null}
        error={form?.error ?? ''}
      />
    </div>
  </div>
{/if}

{#if confirmArchive}
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) confirmArchive = false; }}>
    <div role="dialog" aria-modal="true" aria-label="Archive matter" class="w-full max-w-sm rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg">
      <h2 class="mb-2 font-serif text-lg text-mlq-strong">Archive this matter?</h2>
      <p class="mb-4 text-sm text-mlq-muted">It will be removed from your active matters. Its chats are not deleted.</p>
      <div class="flex justify-end gap-2">
        <button type="button" onclick={() => (confirmArchive = false)} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text">Cancel</button>
        <form method="POST" action="?/archive"><button type="submit" class="rounded-mlq-control bg-mlq-error px-3 py-1.5 text-xs font-medium text-white">Archive</button></form>
      </div>
    </div>
  </div>
{/if}
