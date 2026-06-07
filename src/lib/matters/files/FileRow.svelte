<script lang="ts">
	import { X } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import type { components } from '$lib/api/backend';
	import { formatBytes, statusBadge } from './uploadFile';

	type File = components['schemas']['File'];

	let { file }: { file: File } = $props();

	const badge = $derived(statusBadge(file.ingestion_status));
	const toneClass = $derived(
		badge.tone === 'success'
			? 'text-mlq-success'
			: badge.tone === 'error'
				? 'text-mlq-error'
				: 'text-mlq-muted'
	);
</script>

<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
	<div class="min-w-0 flex-1">
		<div class="truncate text-sm text-mlq-text">{file.filename}</div>
		<div class="mt-0.5 flex items-center gap-2 text-xs">
			<span class="text-mlq-muted">{formatBytes(file.size_bytes)}</span>
			<span class={`${toneClass}`}>{badge.label}</span>
		</div>
	</div>
	<a
		href="/files/{file.id}/content"
		target="_blank"
		rel="noopener"
		class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a
	>
	<form method="POST" action="?/detachFile" use:enhance aria-label="Remove file" class="shrink-0">
		<input type="hidden" name="file_id" value={file.id} />
		<button
			type="submit"
			aria-label={`Remove ${file.filename}`}
			class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
		>
			<X size={14} />
		</button>
	</form>
</div>
