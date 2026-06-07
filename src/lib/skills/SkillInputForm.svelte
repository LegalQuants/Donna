<script lang="ts">
	import type { SkillInputDef } from './types';

	let {
		skillTitle,
		required = [],
		optional = [],
		values = {},
		onchange
	}: {
		skillTitle: string;
		required?: SkillInputDef[];
		optional?: SkillInputDef[];
		values?: Record<string, unknown>;
		onchange: (name: string, value: unknown) => void;
	} = $props();

	// file-type inputs are out of scope (P1.2 covers file_ids); never render them.
	const renderable = (defs: SkillInputDef[]) => defs.filter((d) => d.type !== 'file');
	const req = $derived(renderable(required));
	const opt = $derived(renderable(optional));

	let showOptional = $state(false);

	const provided = (v: unknown): boolean =>
		typeof v === 'string'
			? v.trim().length > 0
			: typeof v === 'number'
				? Number.isFinite(v)
				: v != null;
</script>

<div class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface/50 p-2">
	<div class="mb-1 text-xs font-medium text-mlq-muted">{skillTitle} — inputs</div>

	{#each req as def (def.name)}
		<label class="mb-1.5 flex flex-col gap-0.5">
			<span class="text-xs text-mlq-muted">
				{def.description || def.name}
				{#if !provided(values[def.name])}<span class="text-mlq-error"> ⚠ required</span>{/if}
			</span>
			{@render widget(def)}
		</label>
	{/each}

	{#if opt.length}
		<button
			type="button"
			aria-expanded={showOptional}
			onclick={() => (showOptional = !showOptional)}
			class="mt-1 text-xs text-mlq-workflow hover:underline"
		>
			{showOptional ? '▾' : '▸'} Optional ({opt.length})
		</button>
		{#if showOptional}
			{#each opt as def (def.name)}
				<label class="mt-1 mb-1.5 flex flex-col gap-0.5">
					<span class="text-xs text-mlq-muted">{def.description || def.name}</span>
					{@render widget(def)}
				</label>
			{/each}
		{/if}
	{/if}
</div>

{#snippet widget(def: SkillInputDef)}
	{#if def.type === 'enum' && def.enum}
		<select
			aria-label={def.name}
			value={(values[def.name] as string) ?? ''}
			onchange={(e) => onchange(def.name, e.currentTarget.value)}
			class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		>
			<option value="" disabled>— select —</option>
			{#each def.enum as o (o)}<option value={o}>{o}</option>{/each}
		</select>
	{:else if def.type === 'boolean'}
		<input
			type="checkbox"
			aria-label={def.name}
			checked={values[def.name] === true}
			onchange={(e) => onchange(def.name, e.currentTarget.checked)}
			class="h-4 w-4"
		/>
	{:else if def.type === 'integer'}
		<input
			type="number"
			aria-label={def.name}
			value={(values[def.name] as number | string) ?? ''}
			oninput={(e) =>
				onchange(
					def.name,
					e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value)
				)}
			class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		/>
	{:else}
		<input
			type="text"
			aria-label={def.name}
			value={(values[def.name] as string) ?? ''}
			oninput={(e) => onchange(def.name, e.currentTarget.value)}
			class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		/>
	{/if}
{/snippet}
