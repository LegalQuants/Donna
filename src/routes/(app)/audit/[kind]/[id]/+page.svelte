<!-- src/routes/(app)/audit/[kind]/[id]/+page.svelte -->
<script lang="ts">
	import FiduciaryPill from '$lib/fiduciary/FiduciaryPill.svelte';
	import FiduciaryReceipt from '$lib/fiduciary/FiduciaryReceipt.svelte';
	import { openLedgerSource } from '$lib/fiduciary/openSource';
	import { groupChatLedger } from '$lib/audit/reviewGroups';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
	import type { ProvenanceSource } from '$lib/fiduciary/provenanceExport';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const docPanel = createDocPanel();
	// Per-turn collapse for the chat view (default open — a reviewer wants to see
	// everything, but can fold long chats). Keyed by the group key; a key absent
	// from the map means open.
	let collapsed = $state<Record<string, boolean>>({});
	const isOpen = (key: string) => collapsed[key] !== true;
	const toggle = (key: string) => (collapsed = { ...collapsed, [key]: isOpen(key) });

	const groups = $derived(data.kind === 'chat' ? groupChatLedger(data.ledger) : []);
	const sessionGate = $derived(data.ledger.gates[0] ?? null);
	const isEmpty = $derived(data.ledger.entries.length === 0);

	function chatExportMeta(messageId: string | null): ProvenanceSource | undefined {
		return messageId ? { type: 'chat_turn', chat_id: data.id, message_id: messageId } : undefined;
	}
</script>

<svelte:head><title>Compliance review — Donna</title></svelte:head>

<div class="flex h-full min-h-0">
	<div class="min-w-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-4 py-6">
			<a href="/audit" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
				>← Review</a
			>
			<h1 class="text-xl font-medium text-mlq-text">Compliance review</h1>
			<p class="mt-1 text-sm text-mlq-muted">
				{data.kind === 'chat' ? 'Chat' : 'Autonomous session'}
				<code class="rounded bg-mlq-surface-alt px-1 py-0.5 text-xs">{data.id}</code>
				· viewing as {data.role} · cross-user reads are recorded in the audit log.
			</p>

			{#if isEmpty}
				<p class="mt-6 text-sm text-mlq-muted">
					No ledger entries recorded for this {data.kind === 'chat' ? 'chat' : 'session'}.
				</p>
			{:else if data.kind === 'chat'}
				<div class="mt-4 space-y-4">
					{#each groups as g (g.messageId ?? 'unattributed')}
						{@const key = g.messageId ?? 'unattributed'}
						<section class="rounded-mlq-control border border-mlq-subtle p-3">
							<div class="mb-1">
								<FiduciaryPill gate={g.gate} expanded={isOpen(key)} onclick={() => toggle(key)} />
							</div>
							{#if isOpen(key)}
								<FiduciaryReceipt
									entries={g.entries}
									gate={g.gate}
									onopensource={(e) => openLedgerSource(docPanel, e)}
									exportMeta={chatExportMeta(g.messageId)}
								/>
							{/if}
						</section>
					{/each}
				</div>
			{:else}
				<div class="mt-4">
					<FiduciaryPill gate={sessionGate} expanded={true} onclick={() => {}} />
					<FiduciaryReceipt
						entries={data.ledger.entries}
						gate={sessionGate}
						onopensource={(e) => openLedgerSource(docPanel, e)}
						exportMeta={{ type: 'autonomous_session', session_id: data.id }}
					/>
				</div>
			{/if}
		</div>
	</div>
	{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
</div>
