import type { ExecutionResults, PlaybookExecution } from './types';

export type RunPhase =
	| 'idle'
	| 'uploading'
	| 'ingesting'
	| 'executing'
	| 'analysing'
	| 'done'
	| 'error';

interface RunFlowOptions {
	pollMs?: number;
	stuckMs?: number;
	/** Called with the execution id once execute returns, so the page can push `?execution=`. */
	onExecutionStarted?: (executionId: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRunFlow(playbookId: string, opts: RunFlowOptions = {}) {
	const pollMs = opts.pollMs ?? 2000;
	const stuckMs = opts.stuckMs ?? 300_000;
	let phase = $state<RunPhase>('idle');
	let error = $state<string | null>(null);
	let results = $state<ExecutionResults | null>(null);
	let stuck = $state(false);

	function fail(msg: string) {
		error = msg;
		phase = 'error';
	}

	async function pollExecution(executionId: string): Promise<void> {
		phase = 'analysing';
		let elapsed = 0;
		while (true) {
			const res = await fetch(`/playbook-executions/${executionId}`);
			if (!res.ok) return fail('Lost contact with the run. Please retry.');
			const exec = (await res.json()) as PlaybookExecution & {
				results?: ExecutionResults;
				error?: string | null;
			};
			if (exec.status === 'completed') {
				results = (exec.results as ExecutionResults) ?? null;
				phase = 'done';
				return;
			}
			if (exec.status === 'error') return fail(exec.error ?? 'The playbook run failed.');
			await sleep(pollMs);
			elapsed += pollMs;
			if (elapsed >= stuckMs) stuck = true;
		}
	}

	async function execute(documentId: string, projectId?: string | null): Promise<void> {
		phase = 'executing';
		const res = await fetch(`/playbooks/${playbookId}/execute`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				target_document_id: documentId,
				...(projectId ? { project_id: projectId } : {})
			})
		});
		if (!res.ok) return fail('Could not start the playbook run.');
		const exec = (await res.json()) as PlaybookExecution;
		opts.onExecutionStarted?.(exec.id);
		await pollExecution(exec.id);
	}

	async function runWithDocument(documentId: string, projectId?: string | null): Promise<void> {
		error = null;
		results = null;
		stuck = false;
		await execute(documentId, projectId);
	}

	async function runWithUpload(file: File): Promise<void> {
		error = null;
		results = null;
		stuck = false;
		phase = 'uploading';
		const fd = new FormData();
		fd.append('file', file, file.name);
		const upRes = await fetch('/files', { method: 'POST', body: fd });
		if (!upRes.ok)
			return fail(upRes.status === 413 ? 'That file is too large.' : 'Could not upload the file.');
		const { id: fileId } = (await upRes.json()) as { id: string };

		phase = 'ingesting';
		while (true) {
			const sRes = await fetch(`/files/${fileId}`);
			if (!sRes.ok) return fail('Could not check the document status.');
			const f = (await sRes.json()) as {
				ingestion_status?: string;
				ingestion_error?: string | null;
				document_id?: string | null;
			};
			if (f.ingestion_status === 'ready' && f.document_id) {
				await execute(f.document_id);
				return;
			}
			if (f.ingestion_status === 'failed')
				return fail(`Document processing failed: ${f.ingestion_error ?? 'unknown error'}.`);
			await sleep(pollMs);
		}
	}

	/** Resume from an execution loaded server-side (?execution=). */
	async function resume(
		exec: PlaybookExecution & { results?: ExecutionResults; error?: string | null }
	): Promise<void> {
		if (exec.status === 'completed') {
			results = (exec.results as ExecutionResults) ?? null;
			phase = 'done';
			return;
		}
		if (exec.status === 'error') return fail(exec.error ?? 'The playbook run failed.');
		await pollExecution(exec.id);
	}

	return {
		get phase() {
			return phase;
		},
		get error() {
			return error;
		},
		get results() {
			return results;
		},
		get stuck() {
			return stuck;
		},
		runWithDocument,
		runWithUpload,
		resume
	};
}
