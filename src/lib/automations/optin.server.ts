import type { RequestEvent } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

/** Whether the user has opted into autonomous automations (`autonomous_enabled`).
 *  Not on the `User` object (`GET /users/me`) — only on the preferences endpoint.
 *  Best-effort: never throws; returns false on any failure (→ shows the opt-in gate). */
export async function isAutonomousEnabled(event: RequestEvent): Promise<boolean> {
	try {
		const res = await lqFetch(event, '/api/v1/users/me/preferences');
		if (!res.ok) return false;
		const body = (await res.json()) as { autonomous_enabled?: unknown };
		return body.autonomous_enabled === true;
	} catch {
		return false;
	}
}
