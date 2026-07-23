<script lang="ts">
	import { Paperclip } from '@lucide/svelte';
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

	/** "perspective" / "doc_type" → "Perspective" / "Doc Type" — the visible field label. */
	const fieldLabel = (name: string) =>
		name.replace(/[_-]+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

	/** Many corpus skills encode their options in the description as "a | b | c. …" —
	 *  a pipe-separated list before the first period. Parse that into select options so
	 *  users pick instead of guessing free text; null ⇒ not an enum-shaped description. */
	function enumFromDescription(def: SkillInputDef): string[] | null {
		if (def.type === 'enum' || def.type === 'boolean' || def.type === 'integer') return null;
		const head = (def.description ?? '').split('.', 1)[0];
		if (!head.includes('|')) return null;
		const opts = head
			.split('|')
			.map((s) => s.trim())
			.filter(Boolean);
		return opts.length >= 2 ? opts : null;
	}

	/** Help text shown under the label: the full description, minus the option list
	 *  when it was parsed into a select (no point showing "a | b | c" twice). */
	function helpText(def: SkillInputDef): string {
		const desc = (def.description ?? '').trim();
		if (!desc) return '';
		if (!enumFromDescription(def)) return desc;
		const dot = desc.indexOf('.');
		return dot === -1 ? '' : desc.slice(dot + 1).trim();
	}
</script>

<div class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface/50 p-2">
	<div class="mb-1 text-xs font-medium text-mlq-muted">{skillTitle} — inputs</div>

	{#each req as def (def.name)}
		{@render field(def, true)}
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
				{@render field(def, false)}
			{/each}
		{/if}
	{/if}
</div>

{#snippet labelLine(def: SkillInputDef, isRequired: boolean)}
	<span class="text-xs text-mlq-text">
		<span class="font-medium">{fieldLabel(def.name)}</span>{#if isRequired}<span
				class="text-mlq-error"
				title="Required">*</span
			>{/if}
		{#if isRequired && def.type !== 'document' && !provided(values[def.name])}<span
				class="text-mlq-error"
			>
				⚠ required</span
			>{/if}
	</span>
	{#if helpText(def)}
		<span class="text-[11px] leading-snug text-mlq-muted">{helpText(def)}</span>
	{/if}
{/snippet}

{#snippet field(def: SkillInputDef, isRequired: boolean)}
	{#if def.type === 'document'}
		<!-- Documents travel as message attachments, never as a typed value — no text box. -->
		<div class="mb-1.5 flex flex-col gap-0.5">
			{@render labelLine(def, isRequired)}
			<span
				data-testid={`doc-hint-${def.name}`}
				class="inline-flex w-fit items-center gap-1 rounded-full border border-mlq-subtle bg-mlq-subtle/40 px-2 py-0.5 text-xs text-mlq-muted"
			>
				<Paperclip size={11} aria-hidden="true" />
				Attach the document to the message — the clip button
			</span>
		</div>
	{:else}
		<label class="mb-1.5 flex flex-col gap-0.5">
			{@render labelLine(def, isRequired)}
			{@render widget(def)}
		</label>
	{/if}
{/snippet}

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
	{:else if enumFromDescription(def)}
		<select
			aria-label={def.name}
			value={(values[def.name] as string) ?? ''}
			onchange={(e) =>
				onchange(def.name, e.currentTarget.value === '' ? undefined : e.currentTarget.value)}
			class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		>
			<option value=""></option>
			{#each enumFromDescription(def) ?? [] as o (o)}<option value={o}>{o}</option>{/each}
		</select>
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
