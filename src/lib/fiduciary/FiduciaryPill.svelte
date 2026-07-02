<!-- src/lib/fiduciary/FiduciaryPill.svelte -->
<!-- The always-visible per-turn trust pill. Distinct from the model-provenance
     preferences/TrustPill.svelte. Renders nothing when there is no gate. -->
<script lang="ts">
	import type { LedgerGate } from './ledger';
	import { gateVerdict } from './trust';

	let {
		gate,
		expanded,
		onclick
	}: { gate: LedgerGate | null; expanded: boolean; onclick: () => void } = $props();

	const verdict = $derived(gateVerdict(gate));
</script>

{#if verdict}
	<button
		type="button"
		{onclick}
		aria-expanded={expanded}
		title={verdict.explanation}
		class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold {verdict.pillClass}"
	>
		<span class="inline-block h-1.5 w-1.5 rounded-full {verdict.dotClass}"></span>
		{verdict.label}
	</button>
{/if}
