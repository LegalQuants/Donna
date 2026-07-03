<!-- src/routes/(app)/audit/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';

	let kind = $state<'chat' | 'session'>('chat');
	let id = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = id.trim();
		if (!trimmed) return;
		goto(`/audit/${kind}/${encodeURIComponent(trimmed)}`);
	}
</script>

<svelte:head><title>Compliance review — Donna</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="mb-1 text-xl font-medium text-mlq-text">Compliance review</h1>
	<p class="mb-4 text-sm text-mlq-muted">
		Read-only. Open a chat or autonomous session by its id to verify its citation ledger and
		fiduciary gate. There is no browse — you review by known id. Cross-user reads are recorded in
		the deployment audit log.
	</p>

	<form
		onsubmit={submit}
		class="flex flex-col gap-3 rounded-mlq-control border border-mlq-subtle p-4"
	>
		<div class="flex gap-4 text-sm">
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="kind"
					value="chat"
					checked={kind === 'chat'}
					onchange={() => (kind = 'chat')}
				/>
				Chat
			</label>
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="kind"
					value="session"
					checked={kind === 'session'}
					onchange={() => (kind = 'session')}
				/>
				Autonomous session
			</label>
		</div>
		<input
			type="text"
			bind:value={id}
			placeholder={kind === 'chat' ? 'chat id (uuid)' : 'session id (uuid)'}
			aria-label="Target id"
			class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
		/>
		<button
			type="submit"
			class="self-start rounded-mlq-control bg-mlq-workflow px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
			disabled={!id.trim()}
		>
			Open review
		</button>
	</form>
</div>
