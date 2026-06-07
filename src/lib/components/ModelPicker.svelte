<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import type { ChatModelOption } from '$lib/models/types';

	let {
		options,
		selected,
		error = false,
		minimumTier = null as 1 | 2 | 3 | 4 | 5 | null,
		onselect
	}: {
		options: ChatModelOption[];
		selected: string;
		error?: boolean;
		minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
		onselect: (id: string) => void;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();

	const current = $derived(options.find((o) => o.id === selected));
	const cloud = $derived(options.filter((o) => o.group === 'cloud'));
	const local = $derived(options.filter((o) => o.group === 'local'));

	function isSubFloor(o: ChatModelOption): boolean {
		return minimumTier != null && o.tier != null && o.tier < minimumTier;
	}
	function choose(o: ChatModelOption) {
		if (isSubFloor(o)) return;
		onselect(o.id);
		open = false;
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
	// Close on outside click.
	$effect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative" {onkeydown}>
	<button
		type="button"
		data-testid="model-picker"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label="Model"
		onclick={() => (open = !open)}
		class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
	>
		<span class="font-medium">{selected}</span>
		{#if current?.label}<span class="text-mlq-muted">· {current.label}</span>{/if}
		<ChevronDown size={13} />
	</button>

	{#if open}
		<div
			role="listbox"
			class="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
		>
			{#if error}
				<p class="px-3 py-2 text-xs text-mlq-muted">Model list unavailable — sending with smart.</p>
			{/if}
			{#if minimumTier != null}
				<p class="border-b border-mlq-subtle bg-mlq-surface-alt px-3 py-2 text-xs text-mlq-muted">
					This matter requires tier ≥ {minimumTier} — lower-tier models are unavailable.
				</p>
			{/if}
			{#each [{ label: 'Cloud', items: cloud }, { label: 'Local', items: local }] as grp (grp.label)}
				{#if grp.items.length}
					<div
						class="bg-mlq-subtle/40 px-3 py-1 text-[10px] tracking-wide text-mlq-muted uppercase"
					>
						{grp.label}
					</div>
					{#each grp.items as opt (opt.id)}
						{@const blocked = isSubFloor(opt)}
						<button
							type="button"
							role="option"
							aria-selected={opt.id === selected}
							aria-disabled={blocked}
							disabled={blocked}
							data-testid={`model-option-${opt.id}`}
							onclick={() => choose(opt)}
							class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent aria-selected:font-semibold"
						>
							<span>{opt.id}</span>
							{#if opt.label}<span class="text-mlq-muted">{opt.label}</span>{/if}
						</button>
					{/each}
				{/if}
			{/each}
		</div>
	{/if}
</div>
