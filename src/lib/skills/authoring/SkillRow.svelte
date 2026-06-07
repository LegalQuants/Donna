<script lang="ts">
	import type { UserSkill } from './types';
	let { skill }: { skill: UserSkill } = $props();
</script>

<a href="/skills/{skill.id}" class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50">
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm text-mlq-text">{skill.display_name}</span>
		{#if skill.description}
			<span class="block truncate text-xs text-mlq-muted">{skill.description}</span>
		{/if}
	</span>
	{#if skill.slash_alias}
		<span
			class="shrink-0 rounded-mlq-control bg-mlq-subtle px-1.5 py-0.5 font-mono text-xs text-mlq-muted"
			>{skill.slash_alias}</span
		>
	{/if}
	{#if skill.tags?.length}
		<span class="shrink-0 text-xs text-mlq-muted">{skill.tags.slice(0, 3).join(' · ')}</span>
	{/if}
</a>
