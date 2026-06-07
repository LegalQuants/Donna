<script lang="ts">
	import { ShieldCheck } from '@lucide/svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Trust — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Trust</h1>

<p class="mb-6 text-sm leading-relaxed text-mlq-muted">
	Donna runs on your own infrastructure. <strong class="text-mlq-text">Local</strong> models answer
	entirely on-device — your prompt never leaves your environment.
	<strong class="text-mlq-text">Cloud</strong> models are scrubbed before any request leaves — identifiers
	are removed at the edge. Each model carries a tier; matters marked privileged enforce a minimum tier.
</p>

<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">
	Where each model sends your data
</h2>
{#if data.modelsError || data.rows.length === 0}
	<p class="mb-6 rounded-mlq-control border border-mlq-subtle px-4 py-3 text-sm text-mlq-muted">
		Couldn't load the model list.
	</p>
{:else}
	<table
		class="mb-6 w-full border-separate border-spacing-0 overflow-hidden rounded-mlq-control border border-mlq-subtle text-sm"
	>
		<thead>
			<tr class="bg-mlq-subtle/40 text-left text-xs tracking-wide text-mlq-muted uppercase">
				<th scope="col" class="px-3 py-2 font-medium">Model</th>
				<th scope="col" class="px-3 py-2 font-medium">Where it runs</th>
				<th scope="col" class="px-3 py-2 font-medium">Tier</th>
				<th scope="col" class="px-3 py-2 font-medium">What it means</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				<tr>
					<td class="border-t border-mlq-subtle px-3 py-2 text-mlq-text"
						>{r.label} <span class="text-mlq-muted">({r.id})</span></td
					>
					<td
						class="border-t border-mlq-subtle px-3 py-2 {r.tone === 'local'
							? 'text-mlq-success'
							: 'text-mlq-caveats'}"><span aria-hidden="true">●</span> {r.where}</td
					>
					<td class="border-t border-mlq-subtle px-3 py-2 text-mlq-muted">{r.tier ?? '—'}</td>
					<td class="border-t border-mlq-subtle px-3 py-2 text-mlq-muted">{r.meaning}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if data.tierConfig}
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">
		Your deployment's tier policy
	</h2>
	<dl class="mb-6 divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle text-sm">
		<div class="flex justify-between px-3 py-2">
			<dt class="text-mlq-muted">Normal chats — minimum tier</dt>
			<dd class="text-mlq-text">{data.tierConfig.default_minimum_tier}</dd>
		</div>
		<div class="flex justify-between px-3 py-2">
			<dt class="text-mlq-muted">Privileged matters — minimum tier</dt>
			<dd class="text-mlq-text">{data.tierConfig.privileged_minimum_tier}</dd>
		</div>
		<div class="flex justify-between px-3 py-2">
			<dt class="text-mlq-muted">Allowed tiers</dt>
			<dd class="text-mlq-text">{data.tierConfig.allowed_tiers_global.join(', ')}</dd>
		</div>
	</dl>
{/if}

<div
	class="flex items-start gap-2 rounded-mlq-control border border-mlq-success/40 bg-mlq-success/10 px-4 py-3 text-sm text-mlq-success"
>
	<ShieldCheck size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
	<span
		>Outbound cloud requests pass through the <strong>anonymization layer</strong> before leaving your
		environment — the same protection shown by the "Anonymized" marker on each answer.</span
	>
</div>
