<script lang="ts">
	import type { LqLearnSection } from './lqLearnSections';
	let { section }: { section: LqLearnSection } = $props();
	const playgroundHref = $derived(`/learn/playgrounds/${section.playground}.html`);
</script>

<section class="mb-10">
	<h2 class="mb-2 text-lg font-medium text-mlq-strong">{section.number}. {section.title}</h2>
	{#each section.paragraphs as p (p)}
		<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">{p}</p>
	{/each}
	<iframe
		src={playgroundHref}
		title="{section.title} — interactive"
		loading="lazy"
		class="mt-2 h-[900px] w-full rounded-mlq-control border border-mlq-subtle"
	></iframe>
	<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mlq-muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
		<a href={playgroundHref} target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Open full-screen ↗</a>
		<span>
			Source:
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external github link -->
			<a href={section.sourceUrl} target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">{section.sourceLabel}</a>
		</span>
	</div>
</section>
