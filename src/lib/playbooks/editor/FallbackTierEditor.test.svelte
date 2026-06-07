<script lang="ts">
	import { untrack } from 'svelte';
	import FallbackTierEditor from './FallbackTierEditor.svelte';
	import type { FallbackTier } from '../types';
	let { initial, onseen }: { initial: FallbackTier[]; onseen: (t: FallbackTier[]) => void } =
		$props();
	let tiers = $state<FallbackTier[]>(untrack(() => initial));
	$effect(() => onseen(tiers));
</script>

<FallbackTierEditor bind:tiers />
