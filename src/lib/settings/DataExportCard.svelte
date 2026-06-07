<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ExportJob, ExportStatus } from './dataPrivacy';

	type Phase = 'idle' | ExportStatus;

	let phase = $state<Phase>('idle');
	let jobId = $state<string | null>(null);
	let downloadUrl = $state<string | null>(null);
	let error = $state<string | null>(null);

	const POLL_INTERVAL_MS = 2000;
	const isRunning = $derived(phase === 'queued' || phase === 'processing');

	function applyJob(job: ExportJob) {
		phase = job.status;
		jobId = job.job_id;
		downloadUrl = job.download_url ?? null;
	}

	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success' && result.data?.export) {
				error = null;
				applyJob(result.data.export as ExportJob);
			} else if (result.type === 'failure') {
				error = (result.data?.exportError as string | undefined) ?? 'Could not start the export.';
			} else {
				await update();
			}
		};

	// Poll the BFF proxy while a job runs; pause while the tab is hidden; stop on
	// a terminal status (isRunning flips false -> $effect cleanup clears the timer).
	$effect(() => {
		if (!isRunning || !jobId) return;
		const id = jobId;
		const tick = async () => {
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
			try {
				const res = await fetch(`/settings/data/export/${id}`);
				if (res.status === 404) {
					phase = 'failed';
					return;
				}
				if (!res.ok) return; // transient gateway hiccup; keep polling
				applyJob((await res.json()) as ExportJob);
			} catch {
				/* network hiccup; keep polling */
			}
		};
		const pollId = setInterval(tick, POLL_INTERVAL_MS);
		return () => clearInterval(pollId);
	});

	function reset() {
		phase = 'idle';
		jobId = null;
		downloadUrl = null;
		error = null;
	}
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
	<h2
		class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium tracking-wide text-mlq-muted uppercase"
	>
		Export your data
	</h2>
	<div class="px-4 py-3 text-sm">
		{#if phase === 'completed' && downloadUrl}
			<p class="text-mlq-text">Your export is ready.</p>
			<p class="mt-0.5 mb-3 text-xs text-mlq-muted">The download link is valid for 24 hours.</p>
			<div class="flex items-center gap-3">
				<a
					href={downloadUrl}
					download
					class="rounded-mlq-control bg-mlq-workflow px-2.5 py-1 text-xs text-white"
					>Download archive</a
				>
				<button type="button" onclick={reset} class="text-xs text-mlq-workflow hover:underline"
					>Start a new export</button
				>
			</div>
		{:else if phase === 'failed'}
			<p class="text-mlq-text">Export failed.</p>
			<p class="mt-0.5 mb-3 text-xs text-mlq-muted">Something went wrong preparing your archive.</p>
			<button
				type="button"
				onclick={reset}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
				>Try again</button
			>
		{:else if isRunning}
			<div class="flex items-center gap-2 text-mlq-text">
				<span
					class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-mlq-subtle border-t-mlq-text"
					aria-hidden="true"
				></span>
				<span>Preparing your export… this can take a minute.</span>
			</div>
		{:else}
			<p class="mb-3 text-mlq-muted">
				Generate a downloadable archive of your matters, chats, and documents.
			</p>
			<form method="POST" action="?/requestExport" use:enhance={submit}>
				<button
					type="submit"
					class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
					>Export my data</button
				>
			</form>
			{#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
		{/if}
	</div>
</section>
