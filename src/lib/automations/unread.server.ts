import type { RequestEvent } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

/** Total unread notifications. Best-effort: never throws — returns 0 on any failure
 *  so a flaky count can't break the sessions/inbox pages. Uses limit=1 and reads total_count. */
export async function unreadCount(event: RequestEvent): Promise<number> {
  try {
    const res = await lqFetch(event, '/api/v1/autonomous/notifications?unread=true&limit=1');
    if (!res.ok) return 0;
    const body = (await res.json()) as { total_count?: unknown };
    return typeof body.total_count === 'number' ? body.total_count : 0;
  } catch {
    return 0;
  }
}
