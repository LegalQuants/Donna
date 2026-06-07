<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import type { createTabularBuilder } from './tabularBuilder.svelte';

	let { builder }: { builder: ReturnType<typeof createTabularBuilder> } = $props();
</script>

<div class="space-y-2">
	{#each builder.columns as col, i (col.id)}
		<div class="flex items-start gap-2">
			<div class="flex-1 space-y-1">
				<input
					value={col.name}
					oninput={(e) => builder.setColumn(col.id, { name: e.currentTarget.value })}
					placeholder="Column name"
					aria-label="Column name"
					class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
				/>
				<input
					value={col.query}
					oninput={(e) => builder.setColumn(col.id, { query: e.currentTarget.value })}
					placeholder="What should we extract? e.g. Which state's law governs?"
					aria-label="Column question"
					class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
				/>
				<label class="flex items-center gap-2 text-xs text-mlq-muted">
					Min. model tier
					<select
						value={col.minimum_inference_tier ?? ''}
						onchange={(e) =>
							builder.setColumn(col.id, {
								minimum_inference_tier: e.currentTarget.value ? Number(e.currentTarget.value) : null
							})}
						aria-label="Minimum model tier for {col.name || 'this column'}"
						class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
					>
						<option value="">None</option>
						<option value="1">1</option>
						<option value="2">2</option>
						<option value="3">3</option>
						<option value="4">4</option>
						<option value="5">5</option>
					</select>
				</label>
				<label class="flex items-center gap-2 text-xs text-mlq-muted">
					<input
						type="checkbox"
						checked={col.ensemble_verification ?? false}
						onchange={(e) =>
							builder.setColumn(col.id, { ensemble_verification: e.currentTarget.checked || null })}
						aria-label="Ensemble verification for {col.name || 'this column'}"
						class="rounded-mlq-control border border-mlq-subtle"
					/>
					Ensemble verification
				</label>
			</div>
			{#if builder.columns.length > 1}
				<div class="mt-1.5 flex flex-col items-center">
					<button
						type="button"
						aria-label="Move {col.name || 'column'} up"
						onclick={() => builder.moveColumn(col.id, -1)}
						disabled={i === 0}
						class="px-1 text-mlq-muted hover:text-mlq-text disabled:opacity-30">↑</button
					>
					<button
						type="button"
						aria-label="Move {col.name || 'column'} down"
						onclick={() => builder.moveColumn(col.id, 1)}
						disabled={i === builder.columns.length - 1}
						class="px-1 text-mlq-muted hover:text-mlq-text disabled:opacity-30">↓</button
					>
					<button
						type="button"
						aria-label="Remove column"
						onclick={() => builder.removeColumn(col.id)}
						class="px-1 text-mlq-muted hover:text-mlq-text"><X size={16} /></button
					>
				</div>
			{/if}
		</div>
	{/each}
	<button
		type="button"
		onclick={() => builder.addColumn()}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow"
	>
		<Plus size={13} aria-hidden="true" /> Add column
	</button>
</div>
