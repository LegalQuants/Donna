<script lang="ts">
	import { untrack } from 'svelte';
	import KbHeader from '$lib/knowledge/KbHeader.svelte';
	import KbFilesSection from '$lib/knowledge/KbFilesSection.svelte';
	import HybridAlphaControl from '$lib/knowledge/HybridAlphaControl.svelte';
	import type { PendingUpload } from '$lib/knowledge/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Client-side pending uploads — populated by the ?/uploadFile action's
	// `uploaded` return value. KbFileRow's polling drives each row to
	// ready/failed; once attach succeeds, the next invalidateAll() lands
	// the file in `data.files` and we filter the matching pending out.
	let pendingUploads = $state<PendingUpload[]>([]);

	$effect(() => {
		if (form && 'uploaded' in form && Array.isArray(form.uploaded)) {
			// untrack: read current pendingUploads without creating a reactive
			// dependency — avoids the self-referential cycle that prevents this
			// effect from running in Svelte 5's reactivity system.
			pendingUploads = [...untrack(() => pendingUploads), ...(form.uploaded as PendingUpload[])];
		}
	});

	$effect(() => {
		const attachedIds = new Set(data.files.map((f) => f.id));
		// untrack: same reason — read without a reactive dependency.
		pendingUploads = untrack(() => pendingUploads.filter((p) => !attachedIds.has(p.file_id)));
	});

	const uploadError = $derived(
		form && 'error' in form && typeof form.error === 'string' ? form.error : ''
	);
</script>

<svelte:head><title>{data.kb.name} — Knowledge — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-xs text-mlq-muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app breadcrumb link -->
		<a href="/knowledge" class="hover:text-mlq-text">Knowledge</a>
		<span class="mx-1">·</span>
		<span>{data.kb.name}</span>
	</nav>

	<KbHeader kb={data.kb} />

	<KbFilesSection files={data.files} {pendingUploads} error={uploadError} />

	<HybridAlphaControl kb={data.kb} />
</div>
