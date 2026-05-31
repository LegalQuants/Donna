<script lang="ts">
  import { untrack } from 'svelte';
  import PositionEditor from './PositionEditor.svelte';
  import type { PositionCreate } from '../types';
  let { initial, onseen }: { initial: PositionCreate; onseen: (p: PositionCreate) => void } = $props();
  let position = $state<PositionCreate>(untrack(() => initial));
  $effect(() => onseen($state.snapshot(position) as PositionCreate));
</script>

<PositionEditor bind:position />
