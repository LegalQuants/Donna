<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  let { data, children } = $props();
  const displayName = $derived(data.user?.display_name || data.user?.email?.split('@')[0] || 'Account');
</script>

<div class="flex h-screen overflow-hidden">
  <Sidebar {displayName} />
  <main class="flex-1 overflow-y-auto">
    {@render children()}
  </main>
</div>
