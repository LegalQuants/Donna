<script lang="ts">
  let { data } = $props();
</script>

<div class="mx-auto max-w-4xl px-6 py-16">
  <h1 class="font-serif text-2xl text-mlq-strong">Chat {data.chatId}</h1>
  {#if data.draft}
    <p class="mt-4 rounded-mlq-control bg-mlq-surface-alt p-4 text-mlq-text">{data.draft}</p>
  {/if}
  <p class="mt-2 text-mlq-muted">The conversation surface arrives in P2.</p>
</div>
