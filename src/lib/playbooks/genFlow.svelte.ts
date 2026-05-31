import type { DraftPlaybook, EasyPlaybookGeneration } from './types';

export type GenPhase = 'idle' | 'preparing' | 'generating' | 'review' | 'error';

export type DocSelection =
  | { kind: 'matter'; documentId: string }
  | { kind: 'upload'; file: File };

interface GenFlowOptions {
  pollMs?: number;
  stuckMs?: number;
  onGenerationStarted?: (generationId: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createGenFlow(opts: GenFlowOptions = {}) {
  const pollMs = opts.pollMs ?? 2000;
  const stuckMs = opts.stuckMs ?? 300_000;
  let phase = $state<GenPhase>('idle');
  let error = $state<string | null>(null);
  let stuck = $state(false);
  let draft = $state<DraftPlaybook | null>(null);

  function fail(msg: string) {
    error = msg;
    phase = 'error';
  }

  async function ingestUpload(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const up = await fetch('/files', { method: 'POST', body: fd });
    if (!up.ok) { fail(up.status === 413 ? `"${file.name}" is too large.` : `Could not upload "${file.name}".`); return null; }
    const { id } = (await up.json()) as { id: string };
    while (true) {
      const r = await fetch(`/files/${id}`);
      if (!r.ok) { fail('Could not check document status.'); return null; }
      const f = (await r.json()) as { ingestion_status?: string; ingestion_error?: string | null; document_id?: string | null };
      if (f.ingestion_status === 'ready' && f.document_id) return f.document_id;
      if (f.ingestion_status === 'failed') { fail(`"${file.name}" failed to process: ${f.ingestion_error ?? 'unknown error'}.`); return null; }
      await sleep(pollMs);
    }
  }

  async function pollGeneration(generationId: string): Promise<void> {
    phase = 'generating';
    let elapsed = 0;
    while (true) {
      const res = await fetch(`/playbooks/easy/${generationId}`);
      if (!res.ok) return fail('Lost contact with the generation. Please retry.');
      const gen = (await res.json()) as EasyPlaybookGeneration & { draft_playbook?: DraftPlaybook; error_message?: string | null };
      if (gen.status === 'completed') { draft = (gen.draft_playbook as DraftPlaybook) ?? null; phase = 'review'; return; }
      if (gen.status === 'error') return fail(gen.error_message ?? 'Playbook generation failed.');
      await sleep(pollMs);
      elapsed += pollMs;
      if (elapsed >= stuckMs) stuck = true;
    }
  }

  async function startGeneration(documentIds: string[], contractType: string): Promise<void> {
    phase = 'generating';
    const res = await fetch('/playbooks/easy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_ids: documentIds, contract_type: contractType, persist_documents_after_generation: true })
    });
    if (!res.ok) return fail('Could not start playbook generation.');
    const gen = (await res.json()) as EasyPlaybookGeneration;
    opts.onGenerationStarted?.(gen.id);
    await pollGeneration(gen.id);
  }

  async function generate(selections: DocSelection[], contractType: string): Promise<void> {
    error = null;
    stuck = false;
    draft = null;
    phase = 'preparing';
    const documentIds: string[] = [];
    for (const sel of selections) {
      if (sel.kind === 'matter') {
        documentIds.push(sel.documentId);
      } else {
        const id = await ingestUpload(sel.file);
        if (id === null) return;
        documentIds.push(id);
      }
    }
    if (documentIds.length === 0) return fail('Select at least one document.');
    await startGeneration(documentIds, contractType);
  }

  async function resume(gen: EasyPlaybookGeneration & { draft_playbook?: DraftPlaybook; error_message?: string | null }): Promise<void> {
    if (gen.status === 'completed') { draft = (gen.draft_playbook as DraftPlaybook) ?? null; phase = 'review'; return; }
    if (gen.status === 'error') return fail(gen.error_message ?? 'Playbook generation failed.');
    await pollGeneration(gen.id);
  }

  return {
    get phase() { return phase; },
    get error() { return error; },
    get stuck() { return stuck; },
    get draft() { return draft; },
    generate,
    resume
  };
}
