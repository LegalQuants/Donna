import type { MatterHeaderInfo } from '$lib/matters/types';

type Fetcher = (path: string) => Promise<Response>;

/** Resolve a chat's matter for the header. Returns null when unscoped or on error.
 *  Takes the chat's project_id (the caller fetches the chat once and derives it,
 *  so we don't re-GET /chats/{id} here). Carries privileged + minimumTier so the
 *  chat page can render the PrivilegedChip and pass the tier floor to the model picker. */
export async function resolveMatter(
	fetcher: Fetcher,
	projectId: string | null | undefined
): Promise<MatterHeaderInfo | null> {
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
