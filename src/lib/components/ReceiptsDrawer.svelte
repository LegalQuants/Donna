<!-- src/lib/components/ReceiptsDrawer.svelte -->
<script lang="ts">
	import { X, Download } from '@lucide/svelte';
	import ReceiptEventRow from './ReceiptEventRow.svelte';
	import type { ReceiptEvent } from '$lib/receipts/types';

	let { chatId, open, onclose }: { chatId: string; open: boolean; onclose: () => void } = $props();

	let status = $state<'idle' | 'loading' | 'error' | 'ready'>('idle');
	let events = $state<ReceiptEvent[]>([]);
	let offKinds = $state<Set<string>>(new Set()); // kinds toggled OFF

	async function load() {
		status = 'loading';
		try {
			const res = await fetch(`/chats/${chatId}/receipts`);
			if (!res.ok) {
				status = 'error';
				return;
			}
			events = (await res.json()) as ReceiptEvent[];
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	// Fetch each time the drawer opens (chats are bounded; reflects new turns).
	$effect(() => {
		if (open) {
			offKinds = new Set();
			load();
		}
	});

	// Esc closes while open.
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	});

	const presentKinds = $derived([...new Set(events.map((e) => e.kind))] as string[]);
	const shown = $derived(events.filter((e) => !offKinds.has(e.kind)));

	function toggle(kind: string) {
		const next = new Set(offKinds);
		if (next.has(kind)) next.delete(kind);
		else next.add(kind);
		offKinds = next;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="scrim" onclick={onclose} role="presentation"></div>
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<aside class="drawer" role="dialog" aria-modal="true" aria-label="Receipts">
		<header class="hd">
			<h2>
				Receipts {#if status === 'ready'}<span class="count">· {events.length} events</span>{/if}
			</h2>
			<div class="actions">
				<a class="exp" href={`/chats/${chatId}/receipts/export.jsonl`} download
					><Download size={13} /> Export</a
				>
				<button type="button" class="close" aria-label="Close receipts" onclick={onclose}
					><X size={16} /></button
				>
			</div>
		</header>

		{#if status === 'ready' && events.length > 0}
			<div class="chips">
				{#each presentKinds as k (k)}
					<button type="button" class="chip" class:off={offKinds.has(k)} onclick={() => toggle(k)}
						>{k}</button
					>
				{/each}
			</div>
		{/if}

		<div class="scroll">
			{#if status === 'loading'}
				<p class="state">Loading…</p>
			{:else if status === 'error'}
				<p class="state">
					Couldn't load receipts. <button type="button" class="retry" onclick={load}>Retry</button>
				</p>
			{:else if status === 'ready' && events.length === 0}
				<p class="state">No receipts yet for this chat.</p>
			{:else}
				{#each shown as e (e.ts + e.kind + JSON.stringify(e.detail))}
					<ReceiptEventRow event={e} />
				{/each}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgb(17 24 39 / 12%);
		z-index: 40;
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(440px, 90vw);
		background: var(--color-mlq-surface);
		border-left: 1px solid var(--color-mlq-subtle);
		box-shadow: -8px 0 28px rgb(0 0 0 / 10%);
		z-index: 41;
		display: flex;
		flex-direction: column;
		font-family: var(--font-sans);
	}
	.hd {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
		border-bottom: 1px solid var(--color-mlq-subtle);
	}
	.hd h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-mlq-strong);
	}
	.count {
		font-weight: 400;
		color: var(--color-mlq-muted);
		font-size: 12px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.exp {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11.5px;
		color: var(--color-mlq-workflow);
		text-decoration: none;
	}
	.close {
		border: none;
		background: none;
		color: var(--color-mlq-muted);
		cursor: pointer;
		padding: 2px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--color-mlq-subtle);
	}
	.chip {
		font-size: 10.5px;
		text-transform: capitalize;
		border: 1px solid var(--color-mlq-subtle);
		border-radius: 999px;
		padding: 2px 9px;
		background: var(--color-mlq-surface-alt);
		color: var(--color-mlq-text);
		cursor: pointer;
	}
	.chip.off {
		opacity: 0.4;
		text-decoration: line-through;
	}
	.scroll {
		overflow-y: auto;
		flex: 1;
	}
	.state {
		padding: 18px 14px;
		font-size: 13px;
		color: var(--color-mlq-muted);
	}
	.retry {
		font-size: 12px;
		color: var(--color-mlq-workflow);
		background: none;
		border: none;
		cursor: pointer;
	}
</style>
