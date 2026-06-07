<!-- src/lib/components/ReceiptEventRow.svelte -->
<script lang="ts">
	import {
		MessageSquare,
		Search,
		Cpu,
		Puzzle,
		Shield,
		TriangleAlert,
		Dot,
		ShieldCheck
	} from '@lucide/svelte';
	import { describeEvent, anonStatus } from '$lib/receipts/format';
	import type { ReceiptEvent } from '$lib/receipts/types';

	let { event }: { event: ReceiptEvent } = $props();

	const view = $derived(describeEvent(event));
	const anon = $derived(anonStatus(event));
	let showRaw = $state(false);

	const ICONS: Record<string, typeof MessageSquare> = {
		message: MessageSquare,
		retrieval: Search,
		inference: Cpu,
		skill: Puzzle,
		audit: Shield,
		error: TriangleAlert
	};
	const Icon = $derived(ICONS[event.kind] ?? Dot);
	const time = $derived(new Date(event.ts).toLocaleTimeString());
	const raw = $derived(JSON.stringify(event.detail, null, 2));
</script>

<div class="row" class:err={view.tone === 'error'}>
	<div class="ico ico-{event.kind}"><Icon size={14} /></div>
	<div class="body">
		<div class="top">
			<span class="lbl">
				{view.label}
				{#if view.tier != null}<span class="tier">Tier {view.tier}</span>{/if}
			</span>
			<span class="ts">{time}</span>
		</div>
		{#if view.detail}<div class="sub">{view.detail}</div>{/if}
		{#if anon}
			<div class="anon" class:on={anon === 'applied'}>
				{#if anon === 'applied'}<ShieldCheck size={11} /> Anonymized{:else}<Shield size={11} /> No anonymization{/if}
			</div>
		{/if}
		<button type="button" class="raw-toggle" onclick={() => (showRaw = !showRaw)}
			>{showRaw ? 'Hide details' : 'Details'}</button
		>
		{#if showRaw}<pre class="raw">{raw}</pre>{/if}
	</div>
</div>

<style>
	.row {
		display: flex;
		gap: 10px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--color-mlq-subtle);
		font-family: var(--font-sans);
	}
	.ico {
		width: 26px;
		height: 26px;
		border-radius: 7px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		color: var(--color-mlq-muted);
		background: var(--color-mlq-surface-alt);
	}
	.ico-retrieval {
		color: var(--color-mlq-workflow);
	}
	.ico-inference {
		color: var(--color-mlq-success);
	}
	.ico-error {
		color: var(--color-mlq-error);
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12.5px;
		color: var(--color-mlq-text);
	}
	.lbl {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.tier {
		font-size: 9.5px;
		font-weight: 700;
		color: #fff;
		background: var(--color-mlq-success);
		border-radius: 999px;
		padding: 1px 6px;
	}
	.ts {
		font-variant-numeric: tabular-nums;
		color: var(--color-mlq-muted);
		font-size: 10.5px;
	}
	.sub {
		font-size: 11.5px;
		color: var(--color-mlq-muted);
		margin-top: 2px;
		line-height: 1.4;
	}
	.err .sub,
	.err .lbl {
		color: var(--color-mlq-error);
	}
	.anon {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 10.5px;
		color: var(--color-mlq-muted);
		margin-top: 3px;
	}
	.anon.on {
		color: var(--color-mlq-success);
	}
	.raw-toggle {
		font-size: 10.5px;
		color: var(--color-mlq-workflow);
		background: none;
		border: none;
		padding: 3px 0 0;
		cursor: pointer;
	}
	.raw {
		font-family: ui-monospace, monospace;
		font-size: 10.5px;
		color: var(--color-mlq-text);
		background: var(--color-mlq-surface-alt);
		border-radius: 6px;
		padding: 6px 8px;
		margin: 4px 0 0;
		overflow-x: auto;
		white-space: pre;
	}
</style>
