<!-- src/lib/fiduciary/FiduciaryReceipt.svelte -->
<!-- The per-turn fiduciary receipt: gate summary + one row per ledger entry
     (source identity + quoted passage + verification chip), with provenance
     ("consulted, not quoted") rows in a lighter group. Reused by Slice 3. -->
<script lang="ts">
	import type { LedgerEntry, LedgerGate } from './ledger';
	import { gateVerdict, entryVerification, isProvenance } from './trust';

	let {
		entries,
		gate,
		onopensource
	}: { entries: LedgerEntry[]; gate: LedgerGate | null; onopensource?: (e: LedgerEntry) => void } =
		$props();

	const verdict = $derived(gateVerdict(gate));
	const quoted = $derived(entries.filter((e) => !isProvenance(e.verification_status)));
	const consulted = $derived(entries.filter((e) => isProvenance(e.verification_status)));

	function sourceTitle(e: LedgerEntry): string {
		const s = e.source;
		if (!s) return e.source_kind;
		if (s.label) return s.label;
		if (s.kind === 'kb_document') return 'Knowledge-base document';
		if (s.kind === 'caselaw') return s.opinion_id ? `Opinion #${s.opinion_id}` : 'Case law';
		if (s.external_ref) return s.external_ref;
		return s.kind;
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
								{sourceTitle(e)}
							</button>
						{:else}
							<span class="font-medium text-mlq-text">{sourceTitle(e)}</span>
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
					{e.source?.label ?? sourceTitle(e)}{#if e.source?.subtitle}
						— {e.source.subtitle}{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
