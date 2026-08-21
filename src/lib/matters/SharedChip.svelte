<script lang="ts">
	import { Users } from '@lucide/svelte';
	import type { SharedMatter } from '$lib/matters/types';

	let { basis }: { basis: SharedMatter['caller_access_basis'] } = $props();

	// "Shared with you" and "firm-wide" are different facts and a lawyer will
	// want to tell them apart: one means somebody put you on this matter, the
	// other means nobody had to.
	const text = $derived(basis === 'org' ? 'Firm-wide' : 'Shared');
	const title = $derived(
		basis === 'org'
			? 'Readable by everyone at the firm'
			: 'You were added to this matter by someone else'
	);
</script>

<span
	aria-label={title}
	{title}
	class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-muted"
>
	<Users size={12} aria-hidden="true" />
	{text}
</span>
