import type { MatterSummary } from '$lib/matters/types';

type Fetcher = (path: string) => Promise<Response>;

/** Resolve a chat's matter for the header badge. Returns null when unscoped or on error. */
export async function resolveMatter(fetcher: Fetcher, chatId: string): Promise<MatterSummary | null> {
  const cRes = await fetcher(`/api/v1/chats/${chatId}`);
  if (!cRes.ok) return null;
  const projectId = ((await cRes.json()) as { project_id?: string | null }).project_id;
  if (!projectId) return null;
  const pRes = await fetcher(`/api/v1/projects/${projectId}`);
  if (!pRes.ok) return null;
  const p = (await pRes.json()) as { id: string; name: string };
  return { id: p.id, name: p.name };
}
