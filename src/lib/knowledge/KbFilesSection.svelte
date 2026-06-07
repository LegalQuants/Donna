<script lang="ts">
	import { enhance } from '$app/forms';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import KbFileRow from './KbFileRow.svelte';
	import type { KBFile, PendingUpload } from './types';

	let {
		files,
		pendingUploads = [],
		error = ''
	}: { files: KBFile[]; pendingUploads?: PendingUpload[]; error?: string } = $props();

	let form = $state<HTMLFormElement>();
	let input = $state<HTMLInputElement>();

	function openPicker() {
		input?.click();
	}
	function submitWith(droppedFiles: File[]) {
		if (!form || !input) return;
		const dt = new DataTransfer();
		for (const f of droppedFiles) dt.items.add(f);
		input.files = dt.files;
		form.requestSubmit();
	}
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Files</h2>

	<form
		bind:this={form}
		method="POST"
		action="?/uploadFile"
		enctype="multipart/form-data"
		use:enhance
		aria-label="Upload files"
	>
		<input
			bind:this={input}
			type="file"
			name="file"
			multiple
			onchange={() => form?.requestSubmit()}
			class="sr-only"
		/>

		{#if files.length === 0 && pendingUploads.length === 0}
			<Dropzone onfiles={(fs) => submitWith(fs)} />
		{:else}
			<div class="rounded-mlq-control border border-mlq-subtle">
				{#each pendingUploads as p (p.file_id)}
					<KbFileRow row={p} />
				{/each}
				{#each files as f (f.id)}
					<KbFileRow row={f} />
				{/each}
			</div>
			<div class="mt-2">
				<button
					type="button"
					onclick={openPicker}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
					>+ Add file</button
				>
			</div>
		{/if}

		{#if error}<p class="mt-2 text-xs text-mlq-error">{error}</p>{/if}
	</form>
</section>
