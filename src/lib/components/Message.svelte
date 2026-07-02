<script lang="ts">
	import { untrack } from 'svelte';
	import Markdown from './Markdown.svelte';
	import CitationView from './CitationView.svelte';
	import ToolSourcesPanel from './ToolSourcesPanel.svelte';
	import FiduciaryPill from '$lib/fiduciary/FiduciaryPill.svelte';
	import FiduciaryReceipt from '$lib/fiduciary/FiduciaryReceipt.svelte';
	import { createTreatmentPoll } from '$lib/fiduciary/treatmentPoll.svelte';
	import type { LedgerEntry } from '$lib/fiduciary/ledger';
	import { ShieldCheck, ScrollText, Paperclip, Scale } from '@lucide/svelte';
	import type { ChatMessage } from '$lib/chat/chatStream.svelte';
	import type { Citation } from '$lib/citations/types';
	import { prettifySkillSlug } from '$lib/skills/skillLabel';
	import { page } from '$app/state';

	let {
		message,
		onretry,
		ondecide,
		onactivatecitation,
		onopensource,
		chatId
	}: {
		message: ChatMessage;
		onretry?: () => void;
		ondecide?: (decision: 'approve' | 'deny') => void;
		onactivatecitation?: (c: Citation) => void;
		onopensource?: (e: LedgerEntry) => void;
		chatId?: string;
	} = $props();
	let copied = $state(false);
	const collapsed = $derived((page.data.user?.provenance_pills ?? 'always') === 'collapsed');
	let showDetails = $state(false);
	let showSources = $state(true); // sources panel defaults open (small, high-value)
	let showLedger = $state(false);
	const showPills = $derived(!collapsed || showDetails);

	// Seeded once via untrack (chatId/message.id don't change for a given turn) —
	// avoids the state_referenced_locally warning documented in CLAUDE.md §7.
	const treatmentPoll = untrack(() => createTreatmentPoll(chatId ?? '', message.id));
	// What the panel displays: poll results override the initial prop entries once they
	// arrive. Never written back onto `message` — mutating an unbound prop is both a
	// Svelte ownership violation and, on a $state-backed message, re-triggers the effect
	// below (stop→start), spawning overlapping poll loops (a fetch storm).
	const shownEntries = $derived(treatmentPoll.entries ?? message.ledgerEntries ?? []);

	$effect(() => {
		if (
			showLedger &&
			(message.ledgerEntries ?? []).some(
				(e) => e.source?.kind === 'caselaw' && e.treatment === null
			)
		) {
			treatmentPoll.start();
			return () => treatmentPoll.stop();
		}
	});

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
		{:else if message.status === 'awaiting_confirmation' && message.confirmation}
			{@const c = message.confirmation}
			<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-3 text-xs">
				<p class="text-mlq-text">
					The assistant wants to run <span class="font-medium">{c.tool}</span> on
					<span class="font-medium">{c.provider}</span>.
				</p>
				<p class="mt-1 text-mlq-muted">Approve to let it run this once, or Deny to skip it.</p>
				{#if c.destructive}
					<p class="mt-1 font-medium text-mlq-error">This tool is destructive.</p>
				{/if}
				{#if Object.keys(c.args_summary).length}
					<dl class="mt-2 space-y-0.5 text-mlq-muted">
						{#each Object.entries(c.args_summary) as [k, v] (k)}
							<div class="flex gap-2">
								<dt class="font-medium">{k}</dt>
								<dd class="min-w-0 break-words">{String(v)}</dd>
							</div>
						{/each}
					</dl>
				{/if}
				<div class="mt-3 flex items-center gap-2">
					<button
						type="button"
						onclick={() => ondecide?.('approve')}
						class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 font-medium text-white hover:opacity-90"
						>Approve</button
					>
					<button
						type="button"
						onclick={() => ondecide?.('deny')}
						class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-mlq-text hover:bg-mlq-surface-alt"
						>Deny</button
					>
					<span
						class="ml-1 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-muted"
						>Tier {c.tier}</span
					>
				</div>
			</div>
		{:else if message.status === 'awaiting_auth' && message.mcpAuth && chatId}
			{@const a = message.mcpAuth}
			<div class="rounded-mlq-control border border-mlq-subtle p-3 text-xs">
				<p class="text-mlq-text">
					Connect <span class="font-medium">{a.server}</span> to use this tool.
				</p>
				<a
					href="/settings/connections/{a.server}/connect?return={encodeURIComponent(
						`/chats/${chatId}`
					)}"
					data-sveltekit-reload
					class="mt-2 inline-block rounded-mlq-control bg-mlq-workflow px-3 py-1.5 font-medium text-white hover:opacity-90"
					>Connect</a
				>
			</div>
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
			{:else if message.status === 'done' && message.content.trim() === '' && !(message.sources && message.sources.length > 0)}
				<p class="text-mlq-muted">
					The model returned an empty response. This can happen with smaller local models on
					requests that need tools. Try again, or switch to a more capable model.
					<button
						type="button"
						onclick={() => onretry?.()}
						class="ml-2 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
						>Retry</button
					>
				</p>
			{:else}
				<Markdown content={message.content} />
			{/if}
			{#if message.status === 'done' && message.sources && message.sources.length > 0 && showSources}
				<ToolSourcesPanel sources={message.sources} />
			{/if}
			{#if message.status === 'done' && message.ledgerGate && showLedger}
				<FiduciaryReceipt
					entries={shownEntries}
					gate={message.ledgerGate}
					{onopensource}
					exportMeta={{ type: 'chat_turn', chat_id: chatId ?? '', message_id: message.id }}
				/>
			{/if}
			{#if message.status === 'streaming' && message.content !== ''}
				<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-mlq-text align-text-bottom"
				></span>
			{/if}
			{#if message.status === 'done'}
				<div class="mt-2 flex items-center gap-2 text-xs text-mlq-muted">
					{#if message.ledgerGate}
						<FiduciaryPill
							gate={message.ledgerGate}
							expanded={showLedger}
							onclick={() => (showLedger = !showLedger)}
						/>
					{/if}
					<button
						type="button"
						onclick={copy}
						class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
						>{copied ? '✓ copied' : '⧉ Copy'}</button
					>
					{#if message.sources && message.sources.length > 0}
						{@const n = message.sources.length}
						<button
							type="button"
							onclick={() => (showSources = !showSources)}
							aria-expanded={showSources}
							class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
						>
							<Scale size={11} aria-hidden="true" />
							{n} source{n === 1 ? '' : 's'} consulted
						</button>
					{/if}
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
