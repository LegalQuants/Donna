import type { MatterHeaderInfo } from '$lib/matters/types';

type Fetcher = (path: string) => Promise<Response>;

/** Resolve a chat's matter for the header. Returns null when unscoped or on error.
 *  Carries privileged + minimumTier so the chat page can render the
 *  PrivilegedChip and pass the tier floor to the model picker. */
export async function resolveMatter(
	fetcher: Fetcher,
	chatId: string
): Promise<MatterHeaderInfo | null> {
	const cRes = await fetcher(`/api/v1/chats/${chatId}`);
	if (!cRes.ok) return null;
	const projectId = ((await cRes.json()) as { project_id?: string | null }).project_id;
	if (!projectId) return null;
	const pRes = await fetcher(`/api/v1/projects/${projectId}`);
	if (!pRes.ok) return null;
	const p = (await pRes.json()) as {
		id: string;
		name: string;
		privileged?: boolean;
		minimum_inference_tier?: 1 | 2 | 3 | 4 | 5 | null;
	};
	return {
		id: p.id,
		name: p.name,
		privileged: p.privileged ?? false,
		minimumTier: p.minimum_inference_tier ?? null
	};
}
