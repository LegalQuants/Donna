<script lang="ts">
  import { enhance } from '$app/forms';
  import { X } from '@lucide/svelte';
  import SkillAttach from '$lib/components/SkillAttach.svelte';
  import { createMatterSkillAttach } from '$lib/matters/skills/createMatterSkillAttach.svelte';

  let { attached }: { attached: string[] } = $props();

  let attachForm = $state<HTMLFormElement>();
  let pendingSlug = $state('');

  const controller = createMatterSkillAttach({
    onattach: (slug) => {
      pendingSlug = slug;
      queueMicrotask(() => attachForm?.requestSubmit());
    }
  });
</script>

<section class="mt-6">
  <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Skills</h2>

  <div class="flex flex-wrap items-center gap-2">
    {#each attached as slug (slug)}
      <form
        method="POST"
        action="?/detachSkill"
        use:enhance
        aria-label={`Remove ${slug}`}
        class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
      >
        <input type="hidden" name="skill_name" value={slug} />
        <span>{slug}</span>
        <button
          type="submit"
          aria-label={`Remove ${slug}`}
          class="text-mlq-muted hover:text-mlq-text"
        ><X size={12} /></button>
      </form>
    {/each}
    <SkillAttach
      results={controller.results}
      loading={controller.loading}
      error={controller.error}
      onopen={controller.open}
      onsearch={controller.search}
      onattach={(s) => controller.attach(s)}
    />
  </div>

  <!-- Single hidden form for picker-driven attaches. -->
  <form
    bind:this={attachForm}
    method="POST"
    action="?/attachSkill"
    use:enhance
    data-testid="attach-skill-form"
    class="hidden"
  >
    <input type="hidden" name="skill_name" value={pendingSlug} />
  </form>
</section>
