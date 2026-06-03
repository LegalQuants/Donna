import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { components } from '$lib/api/backend';

type FileMeta = components['schemas']['File'];

export const load: PageServerLoad = async (event) => {
  const mRes = await lqFetch(event, '/api/v1/projects');
  const matters = (mRes.ok ? ((await mRes.json()) as { id: string; name: string }[]) : []).map((m) => ({
    id: m.id,
    name: m.name
  }));

  let matterFiles: { document_id: string; name: string }[] = [];
  const matterId = event.url.searchParams.get('matter');
  if (matterId) {
    const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
    if (projRes.ok) {
      const proj = (await projRes.json()) as { attached_file_ids?: string[] };
      const metas = await Promise.all(
        (proj.attached_file_ids ?? []).map(async (fid) => {
          const r = await lqFetch(event, `/api/v1/files/${fid}`);
          return r.ok ? ((await r.json()) as FileMeta) : null;
        })
      );
      matterFiles = metas
        .filter((f): f is FileMeta => f !== null && f.ingestion_status === 'ready' && !!f.document_id)
        .map((f) => ({ document_id: f.document_id as string, name: f.filename }));
    }
  }

  return { matters, matterFiles, selectedMatterId: matterId };
};
