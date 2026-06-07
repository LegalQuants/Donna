<script lang="ts">
	import type { SourceItem } from './runNow';
	let {
		items,
		selectedValue,
		label,
		emptyNote = 'Nothing to choose from yet.',
		onselect
	}: {
		items: SourceItem[];
		selectedValue: string | null;
		label: string;
		emptyNote?: string;
		onselect: (value: string) => void;
	} = $props();

	let q = $state('');
	const filtered = $derived(
		q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : items
	);
</script>

{#if items.length === 0}
	<div
		class="rounded-mlq-control border border-dashed border-mlq-subtle px-3 py-6 text-center text-xs text-mlq-muted"
	>
		{emptyNote}
	</div>
{:else}
	<div class="rounded-mlq-control border border-mlq-subtle">
		<input
			type="text"
			aria-label={label}
			placeholder="Search…"
			bind:value={q}
			class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
		/>
		<ul class="max-h-64 overflow-y-auto">
			{#each filtered as i (i.value)}
				<li>
					<button
						type="button"
						onclick={() => onselect(i.value)}
						class="block w-full px-3 py-2 text-left hover:bg-mlq-subtle/50 {selectedValue ===
						i.value
							? 'bg-mlq-subtle/40'
							: ''}"
					>
						<span class="block truncate text-sm text-mlq-text">{i.label}</span>
						{#if i.sub}<span class="block truncate text-xs text-mlq-muted">{i.sub}</span>{/if}
					</button>
				</li>
			{/each}
			{#if filtered.length === 0}
				<li class="px-3 py-2 text-xs text-mlq-muted">No matches.</li>
			{/if}
		</ul>
	</div>
{/if}
