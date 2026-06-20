<script lang="ts">
	import { AlertTriangle } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { toolUsageNote } from '$lib/skills/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const note = $derived(toolUsageNote(data.skill));
</script>

<svelte:head><title>{data.skill.title} — Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-sm text-mlq-muted">
		<a href="/skills" class="hover:text-mlq-text">Skills</a> › {data.skill.title}
	</nav>

	<h1 class="text-xl font-medium text-mlq-text">{data.skill.title}</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-mlq-muted">
		<span class="rounded-full border border-mlq-subtle px-2 leading-5">{data.skill.scope}</span>
		<span class="font-mono">v{data.skill.version}</span>
		{#if data.skill.author}<span>· {data.skill.author}</span>{/if}
		{#if data.skill.jurisdiction}<span>· {data.skill.jurisdiction}</span>{/if}
	</div>

	{#if data.skill.description}
		<p class="mt-3 text-sm text-mlq-text">{data.skill.description}</p>
	{/if}

	{#if note}
		{#if note.unavailable.length > 0}
			<p class="mt-3 flex items-center gap-1.5 text-xs text-mlq-caveats">
				<AlertTriangle size={13} aria-hidden="true" />
				<span>{note.text} — {note.unavailable.join(', ')} not configured in this deployment</span>
			</p>
		{:else}
			<p
				class="mt-3 inline-block rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-muted"
			>
				{note.text}
			</p>
		{/if}
	{/if}

	{#if data.skill.tags?.length}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each data.skill.tags as t (t)}
				<span class="rounded-full bg-mlq-surface-alt px-2 py-0.5 text-xs text-mlq-muted">{t}</span>
			{/each}
		</div>
	{/if}

	<div class="prose prose-sm mt-6 max-w-none border-t border-mlq-subtle pt-6">
		<Markdown content={data.skill.content_md} />
	</div>
</div>
