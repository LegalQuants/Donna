<script lang="ts">
	import ExportMenu from './ExportMenu.svelte';
	import CellDetail from './CellDetail.svelte';
	import type { TabularResults, TabularCell, CellConfidence, TabularCitation } from './types';

	let {
		results,
		columns,
		executionId,
		onactivatecitation
	}: {
		results: TabularResults;
		columns: string[];
		executionId: string;
		onactivatecitation?: (c: TabularCitation) => void;
	} = $props();

	let detail = $state<{ column: string; cell: TabularCell } | null>(null);

	const dot: Record<CellConfidence, string> = {
		high: 'bg-mlq-success',
		medium: 'bg-mlq-caveats',
		low: 'bg-mlq-error',
		failed: 'bg-mlq-muted'
	};
</script>

<div>
	<div class="mb-2 flex items-center justify-between">
		<p class="text-sm text-mlq-muted">
			{results.summary.total_cells} cells · {results.summary.failed_cells} failed
		</p>
		<ExportMenu {executionId} />
	</div>
	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-left text-xs">
			<thead>
				<tr>
					<th
						class="sticky left-0 z-10 border border-mlq-subtle bg-mlq-surface-alt px-2 py-1.5 text-mlq-strong"
						>Document</th
					>
					{#each columns as col, i (i)}
						<th class="border border-mlq-subtle bg-mlq-surface-alt px-2 py-1.5 text-mlq-strong"
							>{col}</th
						>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each results.rows as row (row.document_id)}
					<tr>
						<td
							class="sticky left-0 z-10 border border-mlq-subtle bg-mlq-surface px-2 py-1.5 font-semibold whitespace-nowrap text-mlq-text"
							>{row.document_name}</td
						>
						{#each columns as col, i (i)}
							{@const cell = row.cells[col]}
							<td class="border border-mlq-subtle px-2 py-1.5 align-top">
								{#if cell}
									<button
										type="button"
										class="flex w-full items-start gap-1 text-left"
										onclick={() => (detail = { column: col, cell })}
									>
										<span
											class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full {dot[cell.confidence]}"
										></span>
										{#if cell.confidence === 'failed'}
											<span class="text-mlq-error">(failed)</span>
										{:else}
											<span class="line-clamp-2 text-mlq-text">{cell.value}</span>
											{#if cell.cited_chunk_ids.length}<span
													class="ml-auto shrink-0 text-mlq-workflow"
													>{cell.cited_chunk_ids.length}</span
												>{/if}
										{/if}
									</button>
								{:else}
									<span class="text-mlq-muted">—</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if detail}
	<CellDetail
		column={detail.column}
		cell={detail.cell}
		onclose={() => (detail = null)}
		{onactivatecitation}
	/>
{/if}
