import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook, PlaybookExecution } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

type MatterSummary = { id: string; name: string };
type IngestedFile = { id: string; filename: string; document_id: string };

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.is_admin) {
    throw error(403, 'Running built-in playbooks requires an admin account in this version.');
  }

  const pbRes = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
  if (pbRes.status === 404) throw error(404, 'Playbook not found.');
  if (!pbRes.ok) throw error(502, 'Could not load this playbook.');
  const playbook = (await pbRes.json()) as Playbook;

  const mRes = await lqFetch(event, '/api/v1/projects');
  const matters = (mRes.ok ? ((await mRes.json()) as MatterSummary[]) : []).map((m) => ({ id: m.id, name: m.name }));

  let matterFiles: IngestedFile[] = [];
  const matterId = event.url.searchParams.get('matter');
  if (matterId) {
    const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
    if (projRes.ok) {
      const proj = (await projRes.json()) as { attached_file_ids?: string[] };
      const files = await Promise.all(
        (proj.attached_file_ids ?? []).map(async (fid) => {
          const r = await lqFetch(event, `/api/v1/files/${fid}`);
          return r.ok ? ((await r.json()) as { id: string; filename: string; ingestion_status?: string; document_id?: string | null }) : null;
        })
      );
      matterFiles = files
        .filter((f): f is NonNullable<typeof f> => f !== null && f.ingestion_status === 'ready' && !!f.document_id)
        .map((f) => ({ id: f.id, filename: f.filename, document_id: f.document_id as string }));
    }
  }

  let execution: PlaybookExecution | null = null;
  const executionId = event.url.searchParams.get('execution');
  if (executionId) {
    const eRes = await lqFetch(event, `/api/v1/playbook-executions/${executionId}`);
    if (eRes.ok) execution = (await eRes.json()) as PlaybookExecution;
  }

  return { playbook, matters, matterFiles, execution };
};
