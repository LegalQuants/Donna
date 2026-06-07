<script lang="ts">
	import type { Verdict } from './types';
	import { verdictMeta } from './verdict';

	let { verdict, fallbackRank = null }: { verdict: Verdict; fallbackRank?: number | null } =
		$props();
	const meta = $derived(verdictMeta(verdict));
	const label = $derived(
		verdict === 'matches_fallback' && fallbackRank != null
			? `${meta.label} · tier ${fallbackRank}`
			: meta.label
	);
</script>

<span
	class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase {meta.badgeClass}"
	>{label}</span
>
