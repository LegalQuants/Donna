<script lang="ts">
	import { enhance } from '$app/forms';

	let { onsubmit }: { onsubmit: () => void } = $props();
	let name = $state('');
	const disabled = $derived(name.trim() === '');
</script>

<form
	method="POST"
	action="?/createKb"
	use:enhance={() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') onsubmit();
		}}
	aria-label="Create knowledge base"
	class="p-3"
>
	<label class="block text-xs text-mlq-muted">
		Name
		<input
			name="name"
			type="text"
			required
			bind:value={name}
			placeholder="e.g. Acme Master Agreements"
			class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		/>
	</label>
	<div class="mt-2 flex justify-end">
		<button
			type="submit"
			{disabled}
			class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface disabled:opacity-50"
			>Create</button
		>
	</div>
</form>
