<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Plus } from '@lucide/svelte';
	import type { SkillSuggestion } from '$lib/skills/types';

	let {
		results,
		loading = false,
		error = false,
		onopen,
		onsearch,
		onattach
	}: {
		results: SkillSuggestion[];
		loading?: boolean;
		error?: boolean;
		onopen: () => void;
		onsearch: (q: string) => void;
		onattach: (s: SkillSuggestion) => void;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let timer: ReturnType<typeof setTimeout>;

	// Cancel a pending debounced search if the component unmounts mid-type.
	onDestroy(() => clearTimeout(timer));

	function toggle() {
		open = !open;
		if (open) onopen();
	}
	function oninput(e: Event & { currentTarget: HTMLInputElement }) {
		clearTimeout(timer);
		const q = e.currentTarget.value;
		timer = setTimeout(() => onsearch(q), 200);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
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
		data-testid="skill-attach"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="Attach skill"
		onclick={toggle}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
	>
		<Plus size={13} /> Skill
	</button>

	{#if open}
		<div
			class="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
		>
			<input
				type="text"
				data-testid="skill-search"
				placeholder="Search skills…"
				{oninput}
				class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
			/>
			{#if error}
				<p class="px-3 py-2 text-xs text-mlq-muted">Couldn't load skills.</p>
			{:else if loading}
				<p class="px-3 py-2 text-xs text-mlq-muted">Searching…</p>
			{:else if results.length === 0}
				<p class="px-3 py-2 text-xs text-mlq-muted">No skills found.</p>
			{:else}
				<ul class="max-h-64 overflow-y-auto">
					{#each results as s (s.slug)}
						<li>
							<button
								type="button"
								data-testid={`skill-result-${s.slug}`}
								onclick={() => onattach(s)}
								class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50"
							>
								<span class="font-medium text-mlq-text">{s.title}</span>
								{#if s.description}<span class="mt-0.5 block truncate text-mlq-muted"
										>{s.description}</span
									>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
