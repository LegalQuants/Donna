<script lang="ts">
	import Markdown from './Markdown.svelte';
	import CitationView from './CitationView.svelte';
	import { ShieldCheck, ScrollText, Paperclip } from '@lucide/svelte';
	import type { ChatMessage } from '$lib/chat/chatStream.svelte';
	import type { Citation } from '$lib/citations/types';
	import { prettifySkillSlug } from '$lib/skills/skillLabel';
	import { page } from '$app/state';

	let {
		message,
		onretry,
		onactivatecitation
	}: { message: ChatMessage; onretry?: () => void; onactivatecitation?: (c: Citation) => void } =
		$props();
	let copied = $state(false);
	const collapsed = $derived((page.data.user?.provenance_pills ?? 'always') === 'collapsed');
	let showDetails = $state(false);
	const showPills = $derived(!collapsed || showDetails);

	async function copy() {
		try {
			await navigator.clipboard.writeText(message.content);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable — ignore */
		}
	}
</script>

{#if message.role === 'user'}
	<div class="my-2 text-right">
		<span
			class="inline-block max-w-[80%] rounded-2xl bg-mlq-surface-alt px-3 py-1.5 text-left text-sm text-mlq-text"
			>{message.content}</span
		>
	</div>
{:else}
	<div class="my-4 text-sm">
		{#if showPills && message.routed_inference_tier != null}
			<span
				class="float-right ml-2 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
				>Tier {message.routed_inference_tier}</span
			>
		{:else if showPills && message.status === 'streaming'}
			<span
				class="float-right ml-2 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
				>Tier…</span
			>
		{/if}

		{#if showPills && message.anonymized === true}
			<span
				class="float-right ml-2 inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-success"
				title="This request was processed by the anonymization layer before leaving your environment"
			>
				<ShieldCheck size={11} /> Anonymized
			</span>
		{/if}

		{#if message.status === 'error'}
			<p class="text-mlq-error">
				⚠ {message.error}
				<button
					type="button"
					onclick={() => onretry?.()}
					class="ml-2 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
					>Retry</button
				>
			</p>
		{:else}
			{#if message.content === '' && message.status === 'streaming'}
				<span
					class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle"
					aria-label="Generating"
				></span>
			{:else if message.status === 'done' && message.citations && message.citations.length > 0}
				<CitationView
					content={message.content}
					citations={message.citations as Citation[]}
					onactivate={onactivatecitation}
				/>
			{:else}
				<Markdown content={message.content} />
			{/if}
			{#if message.status === 'streaming' && message.content !== ''}
				<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-mlq-text align-text-bottom"
				></span>
			{/if}
			{#if message.status === 'done'}
				<div class="mt-2 flex items-center gap-2 text-xs text-mlq-muted">
					<button
						type="button"
						onclick={copy}
						class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
						>{copied ? '✓ copied' : '⧉ Copy'}</button
					>
					{#if collapsed}
						<button
							type="button"
							onclick={() => (showDetails = !showDetails)}
							class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
						>
							{showDetails ? 'Hide details' : 'Details'}
						</button>
					{/if}
					{#if showPills && message.applied_skills && message.applied_skills.length > 0}
						{@const skills = message.applied_skills}
						<span class="inline-flex items-center gap-1">
							<ScrollText size={11} aria-hidden="true" />
							<span>Applied:</span>
							{#each skills as slug, i (slug)}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app skills list link -->
								<a href="/skills" class="hover:underline">{prettifySkillSlug(slug)}</a
								>{#if i < skills.length - 1}<span aria-hidden="true">,&nbsp;</span>{/if}{/each}
						</span>
					{/if}
					{#if showPills && message.applied_file_ids && message.applied_file_ids.length > 0}
						{@const n = message.applied_file_ids.length}
						<span class="inline-flex items-center gap-1" data-testid="applied-files">
							<Paperclip size={11} aria-hidden="true" />
							<span>{n} file{n === 1 ? '' : 's'}</span>
						</span>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}
