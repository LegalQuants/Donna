<!-- src/lib/fiduciary/FiduciaryReceipt.svelte -->
<!-- The per-turn fiduciary receipt: gate summary + one row per ledger entry
     (source identity + quoted passage + verification chip), with provenance
     ("consulted, not quoted") rows in a lighter group. Reused by Slice 3. -->
<script lang="ts">
	import type { LedgerEntry, LedgerGate } from './ledger';
	import { gateVerdict, entryVerification, isProvenance } from './trust';
	import {
		ledgerSourceTitle,
		buildProvenanceExport,
		type ProvenanceSource
	} from './provenanceExport';
	import { downloadTextFile } from './download';

	let {
		entries,
		gate,
		onopensource,
		exportMeta
	}: {
		entries: LedgerEntry[];
		gate: LedgerGate | null;
		onopensource?: (e: LedgerEntry) => void;
		exportMeta?: ProvenanceSource;
	} = $props();

	const verdict = $derived(gateVerdict(gate));
	const quoted = $derived(entries.filter((e) => !isProvenance(e.verification_status)));
	const consulted = $derived(entries.filter((e) => isProvenance(e.verification_status)));

	let exportOpen = $state(false);
	function doExport(fmt: 'json' | 'md') {
		if (!exportMeta) return;
		const out = buildProvenanceExport(entries, gate, {
			source: exportMeta,
			exported_at: new Date().toISOString()
		});
		if (fmt === 'json') downloadTextFile(`${out.baseFilename}.json`, 'application/json', out.json);
		else downloadTextFile(`${out.baseFilename}.md`, 'text/markdown', out.markdown);
		exportOpen = false;
	}
</script>

<div class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs">
	<p class="mb-1 font-medium text-mlq-text">Fiduciary receipt</p>
	{#if verdict}
		<p class="mb-2 flex flex-wrap items-center gap-2 text-mlq-muted">
			<span class="font-medium text-mlq-text" title={verdict.explanation}>{verdict.label}</span>
			{#if gate && gate.total_assertions > 0}
				<span>{gate.total_assertions} assertion{gate.total_assertions === 1 ? '' : 's'}</span>
			{/if}
		</p>
	{/if}

	{#if quoted.length > 0}
		<ul class="space-y-2">
			{#each quoted as e (e.id)}
				{@const chip = entryVerification(e.verification_status)}
				<li>
					<span class="flex flex-wrap items-center gap-2">
						{#if onopensource}
							<button
								type="button"
								onclick={() => onopensource(e)}
								class="text-left font-medium text-mlq-workflow hover:underline"
							>
								{ledgerSourceTitle(e)}
							</button>
						{:else}
							<span class="font-medium text-mlq-text">{ledgerSourceTitle(e)}</span>
						{/if}
						<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase {chip.cls}">
							{chip.label}{#if e.confidence !== null}
								· {Math.round(e.confidence * 100)}%{/if}
						</span>
					</span>
					{#each e.source?.passages ?? [] as p, i (i)}
						<span class="mt-0.5 block border-l-2 border-mlq-subtle pl-2 text-mlq-muted italic"
							>&ldquo;{p.text}&rdquo;</span
						>
					{/each}
					{#if e.source?.kind === 'caselaw'}
						{#if e.treatment}
							<span class="mt-1 block text-[11px] text-mlq-muted">
								⚖ Cited by {e.treatment.cited_by_count ?? '—'} · derived{#if e.treatment.strongest_negative_class}
									· strongest signal: {e.treatment.strongest_negative_class}{/if}
							</span>
							{#if e.treatment.signals.length > 0}
								<details class="mt-0.5 text-[11px] text-mlq-muted">
									<summary class="cursor-pointer">Signals</summary>
									<ul class="mt-0.5 space-y-0.5 pl-3">
										{#each e.treatment.signals as sig, i (i)}
											<li>{sig.classification} — {sig.justification}</li>
										{/each}
									</ul>
								</details>
							{/if}
						{:else}
							<span class="mt-1 block text-[11px] text-mlq-muted">checking treatment…</span>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if consulted.length > 0}
		<p class="mt-3 mb-1 text-[10px] font-semibold tracking-wide text-mlq-muted uppercase">
			Consulted, not quoted
		</p>
		<ul class="space-y-1">
			{#each consulted as e (e.id)}
				<li class="text-mlq-muted">
					{e.source?.label ?? ledgerSourceTitle(e)}{#if e.source?.subtitle}
						— {e.source.subtitle}{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if exportMeta}
		<div class="mt-3 border-t border-mlq-subtle pt-2">
			<div class="relative inline-block">
				<button
					type="button"
					onclick={() => (exportOpen = !exportOpen)}
					aria-expanded={exportOpen}
					class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2 py-1 text-[11px] text-mlq-text"
				>
					Export ▾
				</button>
				{#if exportOpen}
					<div
						class="absolute left-0 z-10 mt-1 w-52 rounded-mlq-control border border-mlq-subtle bg-mlq-surface py-1 shadow-md"
					>
						<button
							type="button"
							onclick={() => doExport('json')}
							class="block w-full px-3 py-1.5 text-left text-xs text-mlq-text hover:bg-mlq-surface-alt"
						>
							Provenance record (.json)
						</button>
						<button
							type="button"
							onclick={() => doExport('md')}
							class="block w-full px-3 py-1.5 text-left text-xs text-mlq-text hover:bg-mlq-surface-alt"
						>
							Provenance record (.md)
						</button>
					</div>
				{/if}
			</div>
			<p class="mt-1 text-[10px] text-mlq-muted">
				A faithful copy of the sourcing trail — not a signed attestation.
			</p>
		</div>
	{/if}
</div>
