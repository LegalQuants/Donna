<script lang="ts">
	import type { Redline } from './types';
	let { redline }: { redline: Redline } = $props();
	const hasOld = $derived(redline.old_text.trim().length > 0);
</script>

<div class="space-y-1">
	{#if hasOld}
		<div
			class="border-l-2 border-mlq-error/40 bg-mlq-error/5 px-2 py-1 text-xs text-mlq-error line-through"
		>
			{redline.old_text}
		</div>
	{/if}
	<div class="border-l-2 border-mlq-success/40 bg-mlq-success/5 px-2 py-1 text-xs text-mlq-success">
		{redline.new_text}
	</div>
</div>
