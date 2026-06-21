<script lang="ts">
	let { onpick }: { onpick: (q: string) => void } = $props();
	const EXAMPLES = ['Chevron deference', 'Brown v. Board of Education', 'qualified immunity'];
</script>

<div class="mt-5 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-4">
	<p class="max-w-prose text-sm text-mlq-text">
		<strong>Search U.S. case law.</strong> Donna looks up court opinions from CourtListener. Search
		by topic or case name, click a result to read the full opinion, and use
		<strong>Verify citations</strong>
		to check quoted text against the source.
	</p>
	<div class="mt-3 flex flex-wrap gap-2">
		<span class="text-xs text-mlq-muted">Try:</span>
		{#each EXAMPLES as ex (ex)}
			<button
				type="button"
				onclick={() => onpick(ex)}
				class="rounded-full border border-mlq-subtle px-2.5 py-0.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
				>{ex}</button
			>
		{/each}
	</div>
</div>
