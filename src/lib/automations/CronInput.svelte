<!-- src/lib/automations/CronInput.svelte -->
<script lang="ts">
	import { PRESETS, describeCron, looksValid, normalize } from './cron';

	let {
		value,
		error = null,
		onchange
	}: {
		value: string;
		error?: string | null;
		onchange: (expr: string) => void;
	} = $props();

	let advanced = $state(false);
	const norm = $derived(normalize(value));
	const preview = $derived(describeCron(value));
	const shapeOk = $derived(looksValid(value));
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap gap-2">
		{#each PRESETS as p (p.expr)}
			<button
				type="button"
				aria-pressed={norm === p.expr}
				onclick={() => onchange(p.expr)}
				class="rounded-mlq-control border px-2.5 py-1 text-xs transition-colors {norm === p.expr
					? 'border-mlq-workflow bg-mlq-workflow/10 text-mlq-strong'
					: 'border-mlq-subtle text-mlq-text hover:bg-mlq-subtle/50'}">{p.label}</button
			>
		{/each}
	</div>

	<button
		type="button"
		onclick={() => (advanced = !advanced)}
		class="self-start text-xs text-mlq-muted hover:text-mlq-text"
	>
		<span aria-hidden="true">{advanced ? '▾' : '▸'}</span> Advanced (raw cron)
	</button>

	{#if advanced}
		<input
			aria-label="Cron expression"
			{value}
			oninput={(e) => onchange((e.currentTarget as HTMLInputElement).value)}
			spellcheck="false"
			class="w-full rounded-mlq-control border bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow {shapeOk
				? 'border-mlq-subtle'
				: 'border-mlq-error'}"
		/>
		<div class="flex gap-4 font-mono text-[10px] text-mlq-muted">
			<span>min</span><span>hour</span><span>day</span><span>month</span><span>weekday</span>
		</div>
	{/if}

	<p class="text-xs {shapeOk ? 'text-mlq-success' : 'text-mlq-muted'}">
		{shapeOk ? `✓ ${preview}` : 'Enter a 5-field cron expression'}
	</p>
	{#if error}<p role="alert" class="text-xs text-mlq-error">{error}</p>{/if}
</div>
